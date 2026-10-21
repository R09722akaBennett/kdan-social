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
import { notify } from './notifications';
import { inTags, setPostTags, type TagFilter } from './tags';

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
  /** Left under the post once it is out on Facebook and Instagram; LINE accounts ignore it. */
  firstComment?: string;
  /** The post's tags; omitted keeps the ones it has. */
  tagIds?: string[];
  schedule: Schedule;
  /** The zone a `same` schedule is read in; the person scheduling's own clock. */
  viewerTimeZone?: string;
  /** A draft being scheduled; it becomes this post instead of a new one. */
  draftId?: string;
  now?: Date;
};

const IG_CAPTION_MAX = 2200;
const LINE_TEXT_MAX = 5000;
// One broadcast carries at most five message objects: the text plus four images.
const LINE_IMAGES_MAX = 4;
const MEDIA_MAX = 10;
// Instagram's caption limit, applied to comments too; the platform's own error is recorded
// on the task if it is stricter.
const COMMENT_MAX = 2200;
// A post scheduled a moment ago is still "now"; anything older was a mistake.
const PAST_GRACE_MS = 60_000;

type Account = typeof connectedAccounts.$inferSelect;
type Content = Pick<ComposeInput, 'body' | 'perAccount' | 'media' | 'firstComment'>;

/** The first comment as stored: trimmed, null when empty. */
function commentOf(c: Content) {
  const text = c.firstComment?.trim() ?? '';
  if (text.length > COMMENT_MAX) throw new ComposeError(`第一則留言最多 ${COMMENT_MAX} 字，目前 ${text.length} 字。`);
  return text || null;
}

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

function notifyReviewers(db: Db, workspaceId: string, postId: string, title: string, actor: string) {
  return notify(db, { workspaceId, kind: 'review.requested', managers: true, actor, title: `${actor} 送出「${title}」等待審核`, href: `/app/approvals?post=${postId}` });
}

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

  const firstComment = commentOf(input);
  return db.transaction(async (tx) => {
    const fields = { title: titleOf(input), body: input.body.trim(), firstComment };
    const post = input.draftId
      ? await reopenDraft(tx, { ...input, postId: input.draftId }, fields)
      : (await tx.insert(posts).values({ workspaceId: input.workspaceId, ...fields, createdBy: input.actor }).returning())[0];
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
    if (input.tagIds) await setPostTags(tx, { workspaceId: input.workspaceId, postId: post!.id, tagIds: input.tagIds });
    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: 'post.created',
      target: post!.id,
      detail: { title: post!.title, accounts: rows.length, customised: accounts.filter((a) => input.perAccount?.[a.id] !== undefined).length, schedule: input.schedule.mode, fromDraft: !!input.draftId },
    });
    if (!approved) await notifyReviewers(tx, input.workspaceId, post!.id, post!.title, input.actor);
    return { postId: post!.id, tasks: rows.length };
  });
}

export type DraftInput = Omit<ComposeInput, 'schedule' | 'viewerTimeZone' | 'draftId' | 'now'> & {
  /** The draft being saved again; omitted for a new one. */
  postId?: string;
};

const isManager = (role: Role) => role === 'owner' || role === 'admin';

/**
 * Open a draft for change: its accounts' versions are dropped so the caller writes them
 * again, and its title, main text and first comment take `fields`.
 *
 * Raises:
 *   ComposeError: the post is not in the workspace, the caller is neither its author nor
 *     an owner or admin, or it already has publish tasks and so is no longer a draft.
 */
async function reopenDraft(tx: Db, a: { workspaceId: string; postId: string; actor: string; role: Role }, fields: { title: string; body: string; firstComment: string | null }) {
  const [post] = await tx.select().from(posts).where(and(eq(posts.id, a.postId), eq(posts.workspaceId, a.workspaceId)));
  if (!post) throw new ComposeError('找不到這篇草稿，請重新整理後再試。');
  if (!isManager(a.role) && post.createdBy !== a.actor) throw new ComposeError('只有作者、擁有者或管理員可以修改這篇草稿。');
  const [task] = await tx.select({ id: publishTasks.id }).from(publishTasks).innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .where(eq(postVariants.postId, post.id)).limit(1);
  if (task) throw new ComposeError('這篇貼文已經排程，請從貼文頁修改。');
  await tx.delete(postVariants).where(eq(postVariants.postId, post.id));
  const [updated] = await tx.update(posts).set(fields).where(eq(posts.id, post.id)).returning();
  return updated!;
}

/**
 * Save a post without a time: one version per account and no publish task, so nothing
 * goes out and nobody is asked to review it. Saving an existing draft replaces its
 * accounts and text.
 *
 * Platform rules wait until it is scheduled, since a draft may still lack its image;
 * only the accounts and the media's addresses are checked now.
 *
 * Raises:
 *   ComposeError: no account is chosen, an account is outside the workspace, the media
 *     is invalid, or `postId` is not a draft the caller may change.
 */
export async function saveDraft(db: Db, input: DraftInput) {
  if (input.accountIds.length === 0) throw new ComposeError('請至少選一個要發的帳號。');
  checkMedia(input.media);
  const accounts = await db.select().from(connectedAccounts)
    .where(and(eq(connectedAccounts.workspaceId, input.workspaceId), inArray(connectedAccounts.id, input.accountIds)));
  if (accounts.length !== new Set(input.accountIds).size) throw new ComposeError('有帳號不屬於這個工作區，請重新整理後再試。');
  const firstComment = commentOf(input);
  return db.transaction(async (tx) => {
    const fields = { title: titleOf(input), body: input.body.trim(), firstComment };
    const post = input.postId
      ? await reopenDraft(tx, { ...input, postId: input.postId }, fields)
      : (await tx.insert(posts).values({ workspaceId: input.workspaceId, ...fields, createdBy: input.actor }).returning())[0]!;
    await tx.insert(postVariants).values(accounts.map((account) => ({
      postId: post.id, accountId: account.id, platform: account.platform, body: textFor(input, account.id), media: input.media, reviewStatus: 'draft' as const,
    })));
    if (input.tagIds) await setPostTags(tx, { workspaceId: input.workspaceId, postId: post.id, tagIds: input.tagIds });
    await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actor: input.actor, action: 'post.drafted', target: post.id, detail: { title: post.title, accounts: accounts.length } });
    return { postId: post.id };
  });
}

/** Drafts, newest first, each with its accounts; only those for `accountId` and `tagIds` when given. */
export async function listDrafts(db: Db, a: { workspaceId: string; accountId?: string; tagIds?: TagFilter }) {
  const rows = await db
    .select({ post: posts, accountId: postVariants.accountId, platform: postVariants.platform, account: connectedAccounts.name, body: postVariants.body, media: postVariants.media })
    .from(postVariants)
    .innerJoin(posts, eq(posts.id, postVariants.postId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, postVariants.accountId))
    .where(and(eq(posts.workspaceId, a.workspaceId), eq(postVariants.reviewStatus, 'draft'), inTags(db, a.tagIds)))
    .orderBy(desc(posts.createdAt));
  const byPost = new Map<string, { post: typeof posts.$inferSelect; versions: Array<Omit<(typeof rows)[number], 'post'>> }>();
  for (const { post, ...v } of rows) {
    const entry = byPost.get(post.id) ?? { post, versions: [] };
    entry.versions.push(v);
    byPost.set(post.id, entry);
  }
  return [...byPost.values()].filter((d) => !a.accountId || d.versions.some((v) => v.accountId === a.accountId));
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
    // A draft has no tasks; it is saved with `saveDraft` or scheduled with `createPost`.
    if (tasks.length === 0) throw new ComposeError('這篇是草稿，請從草稿開啟後再儲存或排程。');
    if (tasks.some((t) => t.task.status !== 'scheduled')) throw new ComposeError('這篇貼文已經有帳號發出或正在發送，不能再修改。');
    const accounts = tasks.map((t) => t.account);
    checkContent(accounts, input);
    const runAts = input.schedule.mode === 'keep' ? null : runAtsFor(accounts, input.schedule, input.viewerTimeZone, now);
    const approved = manager || !row.workspace.requiresReview;

    await tx.update(posts).set({ title: titleOf(input), body: input.body.trim(), firstComment: commentOf(input) }).where(eq(posts.id, row.post.id));
    if (input.tagIds) await setPostTags(tx, { workspaceId: input.workspaceId, postId: row.post.id, tagIds: input.tagIds });
    for (const t of tasks) {
      await tx.update(postVariants).set({ body: textFor(input, t.account.id), media: input.media, reviewStatus: approved ? 'approved' : 'pending' }).where(eq(postVariants.id, t.variantId));
      // A retry already counted against the old content does not carry over.
      await tx.update(publishTasks).set({ runAt: runAts?.get(t.account.id) ?? t.task.runAt, attempts: 0, lastError: null }).where(eq(publishTasks.id, t.task.id));
    }
    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId, actor: input.actor, action: 'post.edited', target: row.post.id,
      detail: { title: titleOf(input), schedule: input.schedule.mode, review: approved ? 'approved' : 'pending' },
    });
    if (!approved) await notifyReviewers(tx, input.workspaceId, row.post.id, titleOf(input), input.actor);
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

/**
 * Withdraw whatever of a post has not gone out yet. Accounts already sent to keep their
 * post; their history stays.
 *
 * Raises:
 *   ComposeError: the caller is neither the author nor an owner or admin, the post is
 *     not in the workspace, or nothing of it is still scheduled.
 */
export async function cancelPost(db: Db, a: { workspaceId: string; postId: string; actor: string; role: Role; now?: Date }) {
  const now = a.now ?? new Date();
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(and(eq(posts.id, a.postId), eq(posts.workspaceId, a.workspaceId)));
    if (!post) throw new ComposeError('找不到這篇貼文，請重新整理後再試。');
    if (a.role !== 'owner' && a.role !== 'admin' && post.createdBy !== a.actor) throw new ComposeError('只有作者、擁有者或管理員可以取消這篇貼文。');
    // Locked so the dispatcher, which skips locked rows, cannot start one mid-cancel.
    const open = await tx.select({ id: publishTasks.id }).from(publishTasks).innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
      .where(and(eq(postVariants.postId, post.id), eq(publishTasks.status, 'scheduled'))).for('update', { of: publishTasks });
    if (!open.length) throw new ComposeError('這篇貼文沒有還在排程中的帳號，沒有東西可以取消。');
    await tx.update(publishTasks).set({ status: 'cancelled', finishedAt: now }).where(inArray(publishTasks.id, open.map((t) => t.id)));
    await tx.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'post.cancelled', target: post.id, detail: { title: post.title, tasks: open.length } });
    return { cancelled: open.length };
  });
}
