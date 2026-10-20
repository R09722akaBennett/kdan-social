import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  connectedAccounts,
  markets,
  postVariants,
  posts,
  publishTasks,
  workspaces,
  type Db,
  type MediaItem,
} from './db/index';
import { zonedTimeToUtc } from './time';

/** A validation failure whose message is shown to the user as is. */
export class ComposeError extends Error {}

export type Schedule = { mode: 'now' } | { mode: 'local' | 'same'; date: string; time: string };
type Role = 'owner' | 'admin' | 'editor' | 'reviewer';

export type ComposeInput = {
  workspaceId: string;
  actor: string;
  role: Role;
  body: string;
  /** Per-platform text that replaces `body` for that platform. */
  overrides?: Partial<Record<'facebook' | 'instagram', string>>;
  accountIds: string[];
  media: MediaItem[];
  schedule: Schedule;
  /** The zone a `same` schedule is read in; the person scheduling's own clock. */
  viewerTimeZone?: string;
  now?: Date;
};

const IG_CAPTION_MAX = 2200;
const MEDIA_MAX = 10;
// A post scheduled a moment ago is still "now"; anything older was a mistake.
const PAST_GRACE_MS = 60_000;

/**
 * Create a post, one version per market and platform, and one publish task per account.
 *
 * Owners and admins approve their own posts; anyone else's wait for review in markets
 * that require it, and the dispatcher skips them if nobody approves in time.
 *
 * Raises:
 *   ComposeError: the input breaks a platform rule or names an account outside the workspace.
 */
export async function createPost(db: Db, input: ComposeInput) {
  const now = input.now ?? new Date();
  if (input.accountIds.length === 0) throw new ComposeError('請至少選一個要發的帳號。');
  if (input.media.length > MEDIA_MAX) throw new ComposeError(`圖片最多 ${MEDIA_MAX} 張。`);
  if (input.media.some((m) => !/^https:\/\//.test(m.url))) throw new ComposeError('圖片網址必須是 https。');

  const rows = await db
    .select({ account: connectedAccounts, market: markets })
    .from(connectedAccounts)
    .innerJoin(markets, eq(markets.id, connectedAccounts.marketId))
    .where(and(eq(connectedAccounts.workspaceId, input.workspaceId), inArray(connectedAccounts.id, input.accountIds)));
  if (rows.length !== new Set(input.accountIds).size) throw new ComposeError('有帳號不屬於這個工作區，請重新整理後再試。');

  const textFor = (platform: string) => (input.overrides?.[platform as 'facebook' | 'instagram'] ?? input.body).trim();
  for (const { account } of rows) {
    if (account.status !== 'active') throw new ComposeError(`「${account.name}」的授權已失效，請先重新連結。`);
    if (account.platform === 'line') throw new ComposeError('LINE 發文還沒開放。');
    const text = textFor(account.platform);
    if (account.platform === 'instagram') {
      if (input.media.length === 0) throw new ComposeError(`Instagram（${account.name}）一定要附至少一張圖片。`);
      if (text.length > IG_CAPTION_MAX) throw new ComposeError(`Instagram 內文最多 ${IG_CAPTION_MAX} 字，目前 ${text.length} 字。`);
    }
    if (account.platform === 'facebook' && !text && input.media.length === 0) throw new ComposeError('Facebook 貼文要有文字或圖片。');
  }

  const runAtFor = (timeZone: string): Date => {
    const s = input.schedule;
    if (s.mode === 'now') return now;
    try {
      return zonedTimeToUtc(s.date, s.time, s.mode === 'local' ? timeZone : input.viewerTimeZone ?? 'Asia/Taipei');
    } catch {
      throw new ComposeError('排程日期或時間格式不正確。');
    }
  };
  const runAts = new Map(rows.map(({ market }) => [market.id, runAtFor(market.timeZone)]));
  for (const [, at] of runAts) if (at.getTime() < now.getTime() - PAST_GRACE_MS) throw new ComposeError('排程時間已經過了，請選未來的時間。');

  const selfApproves = input.role === 'owner' || input.role === 'admin';
  const firstLine = (input.body.trim().split('\n')[0] ?? '').slice(0, 40) || '（只有圖片）';

  return db.transaction(async (tx) => {
    const [post] = await tx.insert(posts).values({ workspaceId: input.workspaceId, title: firstLine }).returning();
    const variantIds = new Map<string, string>();
    for (const { account, market } of rows) {
      const key = `${market.id}:${account.platform}`;
      if (!variantIds.has(key)) {
        const [v] = await tx.insert(postVariants).values({
          postId: post!.id,
          marketId: market.id,
          platform: account.platform,
          body: textFor(account.platform),
          media: input.media,
          reviewStatus: selfApproves || !market.requiresReview ? 'approved' : 'pending',
        }).returning();
        variantIds.set(key, v!.id);
      }
      await tx.insert(publishTasks).values({ variantId: variantIds.get(key)!, accountId: account.id, runAt: runAts.get(market.id)! });
    }
    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: 'post.created',
      target: post!.id,
      detail: { title: post!.title, accounts: rows.length, schedule: input.schedule.mode },
    });
    return { postId: post!.id, tasks: rows.length };
  });
}

/** Recent posts with each account's task, newest first. */
export async function listPosts(db: Db, workspaceId: string, limit = 30) {
  const recent = await db.select().from(posts).where(eq(posts.workspaceId, workspaceId)).orderBy(desc(posts.createdAt)).limit(limit);
  if (recent.length === 0) return [];
  const tasks = await db
    .select({
      postId: postVariants.postId,
      id: publishTasks.id,
      status: publishTasks.status,
      runAt: publishTasks.runAt,
      lastError: publishTasks.lastError,
      externalPostId: publishTasks.externalPostId,
      review: postVariants.reviewStatus,
      account: connectedAccounts.name,
      platform: connectedAccounts.platform,
      market: markets.code,
    })
    .from(publishTasks)
    .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .innerJoin(markets, eq(markets.id, postVariants.marketId))
    .where(inArray(postVariants.postId, recent.map((p) => p.id)))
    .orderBy(publishTasks.runAt);
  return recent.map((p) => ({ ...p, tasks: tasks.filter((t) => t.postId === p.id) }));
}

/**
 * Turn real publishing on or off for a workspace. Only owners may.
 *
 * Raises:
 *   ComposeError: the caller is not an owner.
 */
export async function setPublishing(db: Db, a: { workspaceId: string; enabled: boolean; actor: string; role: Role }) {
  if (a.role !== 'owner') throw new ComposeError('只有工作區擁有者可以切換對外發文。');
  await db.update(workspaces).set({ publishingEnabled: a.enabled }).where(eq(workspaces.id, a.workspaceId));
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: a.enabled ? 'publishing.enabled' : 'publishing.disabled', target: a.workspaceId });
}
