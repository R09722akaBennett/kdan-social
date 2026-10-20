import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  accountGroups,
  auditLog,
  connectedAccounts,
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
  /** The main text, sent to every account without its own. */
  body: string;
  /** Text customised for one account, keyed by account id; replaces `body` for it. */
  perAccount?: Record<string, string>;
  accountIds: string[];
  media: MediaItem[];
  schedule: Schedule;
  /** The zone a `same` schedule is read in; the person scheduling's own clock. */
  viewerTimeZone?: string;
  now?: Date;
};

const IG_CAPTION_MAX = 2200;
const LINE_TEXT_MAX = 5000;
// One broadcast carries at most five message objects: the text plus four images.
const LINE_IMAGES_MAX = 4;
const MEDIA_MAX = 10;
// A post scheduled a moment ago is still "now"; anything older was a mistake.
const PAST_GRACE_MS = 60_000;

type Account = typeof connectedAccounts.$inferSelect;
type Content = Pick<ComposeInput, 'body' | 'perAccount' | 'media'>;

function checkMedia(media: MediaItem[]) {
  if (media.length > MEDIA_MAX) throw new ComposeError(`圖片最多 ${MEDIA_MAX} 張。`);
  if (media.some((m) => ![m.url, m.previewUrl ?? m.url].every((u) => /^https:\/\//.test(u)))) throw new ComposeError('圖片網址必須是 https。');
}

// The composer's preview resolves text the same way, so what is shown is what is sent.
const textFor = (c: Content, accountId: string) => (c.perAccount?.[accountId] ?? c.body).trim();

/** Check every account's text and the media against its platform's rules. */
function checkContent(accounts: Account[], c: Content) {
  for (const account of accounts) {
    if (account.status !== 'active') throw new ComposeError(`「${account.name}」的授權已失效，請先重新連結。`);
    const text = textFor(c, account.id);
    if (account.platform === 'instagram') {
      if (c.media.length === 0) throw new ComposeError(`Instagram（${account.name}）一定要附至少一張圖片。`);
      if (text.length > IG_CAPTION_MAX) throw new ComposeError(`Instagram 內文最多 ${IG_CAPTION_MAX} 字，目前 ${text.length} 字。`);
    }
    if (account.platform === 'facebook' && !text && c.media.length === 0) throw new ComposeError('Facebook 貼文要有文字或圖片。');
    if (account.platform === 'line') {
      if (!text && c.media.length === 0) throw new ComposeError('LINE 訊息要有文字或圖片。');
      if (text.length > LINE_TEXT_MAX) throw new ComposeError(`LINE 訊息最多 ${LINE_TEXT_MAX} 字，目前 ${text.length} 字。`);
      if (c.media.length > LINE_IMAGES_MAX) throw new ComposeError(`LINE 一次最多 ${LINE_IMAGES_MAX} 張圖片。`);
    }
  }
}

/** When each account's task runs; refuses a time already past. */
function runAtsFor(accounts: Account[], schedule: Schedule, viewerTimeZone: string | undefined, now: Date) {
  const runAtFor = (timeZone: string): Date => {
    if (schedule.mode === 'now') return now;
    try {
      return zonedTimeToUtc(schedule.date, schedule.time, schedule.mode === 'local' ? timeZone : viewerTimeZone ?? 'Asia/Taipei');
    } catch {
      throw new ComposeError('排程日期或時間格式不正確。');
    }
  };
  const runAts = new Map(accounts.map((a) => [a.id, runAtFor(a.timeZone)]));
  for (const [, at] of runAts) if (at.getTime() < now.getTime() - PAST_GRACE_MS) throw new ComposeError('排程時間已經過了，請選未來的時間。');
  return runAts;
}

const titleOf = (c: Content) => (c.body.trim().split('\n')[0] ?? '').slice(0, 40) || (c.media.length ? '（只有圖片）' : '（無標題）');

/**
 * Create a post with one version and one publish task per account.
 *
 * A `local` schedule runs at the given wall-clock time on each account's own clock;
 * `same` runs every account at one instant, read on the viewer's clock. Owners and
 * admins approve their own posts; anyone else's wait for review when the workspace
 * requires it, and the dispatcher skips them if nobody approves in time.
 *
 * Raises:
 *   ComposeError: the input breaks a platform rule or names an account outside the workspace.
 */
export async function createPost(db: Db, input: ComposeInput) {
  const now = input.now ?? new Date();
  if (input.accountIds.length === 0) throw new ComposeError('請至少選一個要發的帳號。');
  checkMedia(input.media);

  const rows = await db
    .select({ account: connectedAccounts, workspace: workspaces })
    .from(connectedAccounts)
    .innerJoin(workspaces, eq(workspaces.id, connectedAccounts.workspaceId))
    .where(and(eq(connectedAccounts.workspaceId, input.workspaceId), inArray(connectedAccounts.id, input.accountIds)));
  if (rows.length !== new Set(input.accountIds).size) throw new ComposeError('有帳號不屬於這個工作區，請重新整理後再試。');
  const accounts = rows.map((r) => r.account);
  checkContent(accounts, input);
  const runAts = runAtsFor(accounts, input.schedule, input.viewerTimeZone, now);
  const approved = input.role === 'owner' || input.role === 'admin' || !rows[0]!.workspace.requiresReview;

  return db.transaction(async (tx) => {
    const [post] = await tx.insert(posts).values({ workspaceId: input.workspaceId, title: titleOf(input), body: input.body.trim(), createdBy: input.actor }).returning();
    for (const account of accounts) {
      const [v] = await tx.insert(postVariants).values({
        postId: post!.id,
        accountId: account.id,
        platform: account.platform,
        body: textFor(input, account.id),
        media: input.media,
        reviewStatus: approved ? 'approved' : 'pending',
      }).returning();
      await tx.insert(publishTasks).values({ variantId: v!.id, accountId: account.id, runAt: runAts.get(account.id)! });
    }
    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: 'post.created',
      target: post!.id,
      detail: { title: post!.title, accounts: rows.length, customised: accounts.filter((a) => input.perAccount?.[a.id] !== undefined).length, schedule: input.schedule.mode },
    });
    return { postId: post!.id, tasks: rows.length };
  });
}

export type UpdateInput = Omit<ComposeInput, 'accountIds' | 'schedule'> & {
  postId: string;
  /** `keep` leaves every account's time as it is. */
  schedule: Schedule | { mode: 'keep' };
};

/**
 * Change a post's text, media or time before any of it has gone out. Its accounts stay.
 *
 * Saving sends it back to review like a new post: an editor's edit waits for approval
 * again, an owner's or admin's is approved. Its tasks are locked while this runs, so the
 * dispatcher cannot send a version that is being replaced.
 *
 * Raises:
 *   ComposeError: the caller is neither the author nor an owner or admin, the post is
 *     not in the workspace, some account has already been sent to, or the new content
 *     breaks a platform rule.
 */
export async function updatePost(db: Db, input: UpdateInput) {
  const now = input.now ?? new Date();
  checkMedia(input.media);
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ post: posts, workspace: workspaces }).from(posts).innerJoin(workspaces, eq(workspaces.id, posts.workspaceId))
      .where(and(eq(posts.id, input.postId), eq(posts.workspaceId, input.workspaceId)));
    if (!row) throw new ComposeError('找不到這篇貼文，請重新整理後再試。');
    const manager = input.role === 'owner' || input.role === 'admin';
    if (!manager && row.post.createdBy !== input.actor) throw new ComposeError('只有作者、擁有者或管理員可以修改這篇貼文。');

    const tasks = await tx.select({ task: publishTasks, variantId: postVariants.id, account: connectedAccounts }).from(publishTasks)
      .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
      .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
      .where(eq(postVariants.postId, row.post.id))
      .for('update', { of: publishTasks });
    if (tasks.some((t) => t.task.status !== 'scheduled')) throw new ComposeError('這篇貼文已經有帳號發出或正在發送，不能再修改。');
    const accounts = tasks.map((t) => t.account);
    checkContent(accounts, input);
    const runAts = input.schedule.mode === 'keep' ? null : runAtsFor(accounts, input.schedule, input.viewerTimeZone, now);
    const approved = manager || !row.workspace.requiresReview;

    await tx.update(posts).set({ title: titleOf(input), body: input.body.trim() }).where(eq(posts.id, row.post.id));
    for (const t of tasks) {
      await tx.update(postVariants).set({ body: textFor(input, t.account.id), media: input.media, reviewStatus: approved ? 'approved' : 'pending' }).where(eq(postVariants.id, t.variantId));
      // A retry already counted against the old content does not carry over.
      await tx.update(publishTasks).set({ runAt: runAts?.get(t.account.id) ?? t.task.runAt, attempts: 0, lastError: null }).where(eq(publishTasks.id, t.task.id));
    }
    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId, actor: input.actor, action: 'post.edited', target: row.post.id,
      detail: { title: titleOf(input), schedule: input.schedule.mode, review: approved ? 'approved' : 'pending' },
    });
    return { postId: row.post.id, approved };
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
      group: accountGroups.name,
    })
    .from(publishTasks)
    .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId))
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
