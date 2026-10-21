import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { notify } from './notifications';
import { accountGroups, accountPosts, auditLog, connectedAccounts, postComments, postVariants, posts, publishTasks, type Db } from './db/index';

/** A review action refused; the message is shown to the user as is. */
export class ReviewError extends Error {}

type Role = 'owner' | 'admin' | 'editor' | 'reviewer';
export type ReviewState = 'pending' | 'changes_requested' | 'approved';
const COMMENT_MAX = 2000;
// How long an approved post stays in the queue's "approved" section.
const APPROVED_SHOWN_MS = 7 * 86_400_000;

export const canReview = (role: Role) => role === 'owner' || role === 'admin';

/** One post's review state from its variants: any pending or returned variant decides it. */
function stateOf(reviews: string[]): ReviewState {
  if (reviews.includes('changes_requested')) return 'changes_requested';
  if (reviews.includes('pending')) return 'pending';
  return 'approved';
}

export type QueueItem = {
  postId: string;
  title: string;
  createdBy: string | null;
  createdAt: Date;
  firstRunAt: Date;
  state: ReviewState;
  accounts: Array<{ id: string; name: string; platform: 'facebook' | 'instagram' | 'line'; status: 'active' | 'expired' | 'revoked' }>;
};

/**
 * Posts that went through review and still have something scheduled: those waiting
 * for a decision, those sent back, and those approved in the last week.
 *
 * Posts that never needed review (an owner's or admin's own) are left out.
 */
export async function reviewQueue(db: Db, a: { workspaceId: string; now?: Date }): Promise<QueueItem[]> {
  const now = a.now ?? new Date();
  const rows = await db
    .select({
      postId: posts.id, title: posts.title, createdBy: posts.createdBy, createdAt: posts.createdAt,
      review: postVariants.reviewStatus, runAt: publishTasks.runAt, taskStatus: publishTasks.status,
      accountId: connectedAccounts.id, name: connectedAccounts.name, platform: connectedAccounts.platform, accountStatus: connectedAccounts.status,
    })
    .from(posts)
    .innerJoin(postVariants, eq(postVariants.postId, posts.id))
    .innerJoin(publishTasks, eq(publishTasks.variantId, postVariants.id))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .where(and(
      eq(posts.workspaceId, a.workspaceId),
      // Only posts somebody had to review: a pending or returned variant now, or a decision in the log.
      sql`(${posts.id} in (select ${postVariants.postId} from ${postVariants} where ${postVariants.reviewStatus} in ('pending', 'changes_requested'))
        or ${posts.id}::text in (select ${auditLog.target} from ${auditLog} where ${auditLog.action} = 'post.approved' and ${auditLog.at} > ${new Date(now.getTime() - APPROVED_SHOWN_MS)}))`,
    ))
    .orderBy(asc(publishTasks.runAt));

  const byPost = new Map<string, typeof rows>();
  for (const r of rows) byPost.set(r.postId, [...(byPost.get(r.postId) ?? []), r]);
  const items: QueueItem[] = [];
  for (const list of byPost.values()) {
    // Nothing left to decide once every task has run or been skipped.
    if (!list.some((r) => r.taskStatus === 'scheduled')) continue;
    const first = list[0]!;
    items.push({
      postId: first.postId, title: first.title, createdBy: first.createdBy, createdAt: first.createdAt,
      firstRunAt: first.runAt, state: stateOf(list.map((r) => r.review)),
      accounts: list.map((r) => ({ id: r.accountId, name: r.name, platform: r.platform, status: r.accountStatus })),
    });
  }
  return items.sort((x, y) => x.firstRunAt.getTime() - y.firstRunAt.getTime());
}

/**
 * Everything a reviewer reads before deciding on one post: its main text, each
 * account's version, the comments and the post's history, oldest first.
 *
 * Returns:
 *   Null when the post is not in the workspace.
 */
export async function reviewDetail(db: Db, a: { workspaceId: string; postId: string }) {
  const [post] = await db.select().from(posts).where(and(eq(posts.id, a.postId), eq(posts.workspaceId, a.workspaceId)));
  if (!post) return null;
  const [versions, comments, history] = await Promise.all([
    db
      .select({
        accountId: connectedAccounts.id, name: connectedAccounts.name, platform: connectedAccounts.platform,
        accountStatus: connectedAccounts.status, timeZone: connectedAccounts.timeZone, groupName: accountGroups.name,
        body: postVariants.body, media: postVariants.media, review: postVariants.reviewStatus,
        runAt: publishTasks.runAt, taskStatus: publishTasks.status, lastError: publishTasks.lastError, externalPostId: publishTasks.externalPostId,
        commentId: publishTasks.commentId, commentError: publishTasks.commentError,
        // Known once the nightly import has read the post back from the account.
        permalink: accountPosts.permalink,
      })
      .from(postVariants)
      .innerJoin(publishTasks, eq(publishTasks.variantId, postVariants.id))
      .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
      .leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId))
      .leftJoin(accountPosts, and(eq(accountPosts.accountId, publishTasks.accountId), eq(accountPosts.externalId, publishTasks.externalPostId)))
      .where(eq(postVariants.postId, post.id))
      .orderBy(asc(publishTasks.runAt), asc(connectedAccounts.name)),
    db.select().from(postComments).where(eq(postComments.postId, post.id)).orderBy(asc(postComments.createdAt)),
    db.select({ actor: auditLog.actor, action: auditLog.action, at: auditLog.at }).from(auditLog)
      .where(and(eq(auditLog.workspaceId, a.workspaceId), eq(auditLog.target, post.id), inArray(auditLog.action, ['post.created', 'post.edited', 'post.approved', 'post.changes_requested', 'post.cancelled'])))
      .orderBy(asc(auditLog.at)),
  ]);
  return {
    post,
    state: stateOf(versions.map((v) => v.review)),
    // Before the main text was kept, there is nothing to compare a version with.
    versions: versions.map((v) => ({ ...v, customised: post.body !== null && v.body !== post.body })),
    comments,
    history,
    open: versions.some((v) => v.taskStatus === 'scheduled'),
  };
}

/**
 * Approve a post, or send it back with a comment saying what to change.
 *
 * The decision covers every account of the post. Approved versions go out at their
 * scheduled time; returned ones are skipped by the dispatcher unless approved later.
 *
 * Raises:
 *   ReviewError: the caller may not review, sending back without a comment, the post
 *     is not in the workspace, or none of its tasks is still scheduled.
 */
export async function decidePost(db: Db, a: { workspaceId: string; postId: string; decision: 'approve' | 'request_changes'; comment?: string; actor: string; role: Role }) {
  if (!canReview(a.role)) throw new ReviewError('只有擁有者或管理員可以核准貼文。');
  const comment = a.comment?.trim() ?? '';
  if (a.decision === 'request_changes' && !comment) throw new ReviewError('要求修改時請寫下要改的地方。');
  if (comment.length > COMMENT_MAX) throw new ReviewError(`留言最多 ${COMMENT_MAX} 字。`);

  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(and(eq(posts.id, a.postId), eq(posts.workspaceId, a.workspaceId))).for('update');
    if (!post) throw new ReviewError('找不到這篇貼文，請重新整理後再試。');
    const open = await tx.select({ id: publishTasks.id }).from(publishTasks)
      .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
      .where(and(eq(postVariants.postId, post.id), eq(publishTasks.status, 'scheduled')));
    if (!open.length) throw new ReviewError('這篇貼文的排定時間都已經過了，無法再改變審核結果。');

    const status = a.decision === 'approve' ? 'approved' : 'changes_requested';
    await tx.update(postVariants).set({ reviewStatus: status }).where(eq(postVariants.postId, post.id));
    if (comment) await tx.insert(postComments).values({ postId: post.id, author: a.actor, body: comment });
    await tx.insert(auditLog).values({
      workspaceId: a.workspaceId, actor: a.actor, action: a.decision === 'approve' ? 'post.approved' : 'post.changes_requested',
      target: post.id, detail: { title: post.title, ...(comment ? { comment } : {}) },
    });
    await notify(tx, a.decision === 'approve'
      ? { workspaceId: a.workspaceId, kind: 'review.approved', title: `「${post.title}」已核准`, body: comment || null, href: `/app/posts/${post.id}`, emails: [post.createdBy], actor: a.actor }
      : { workspaceId: a.workspaceId, kind: 'review.changes_requested', title: `${a.actor} 要求修改「${post.title}」`, body: comment, href: `/app/approvals?post=${post.id}`, emails: [post.createdBy], actor: a.actor });
    return { state: status as ReviewState };
  });
}

/**
 * Leave a comment on a post without deciding on it. Anyone in the workspace may.
 *
 * Raises:
 *   ReviewError: the comment is empty or too long, or the post is not in the workspace.
 */
export async function commentOnPost(db: Db, a: { workspaceId: string; postId: string; body: string; actor: string }) {
  const body = a.body.trim();
  if (!body) throw new ReviewError('留言是空的。');
  if (body.length > COMMENT_MAX) throw new ReviewError(`留言最多 ${COMMENT_MAX} 字。`);
  const [post] = await db.select({ id: posts.id, title: posts.title, createdBy: posts.createdBy }).from(posts).where(and(eq(posts.id, a.postId), eq(posts.workspaceId, a.workspaceId)));
  if (!post) throw new ReviewError('找不到這篇貼文，請重新整理後再試。');
  const earlier = await db.selectDistinct({ author: postComments.author }).from(postComments).where(eq(postComments.postId, post.id));
  await db.insert(postComments).values({ postId: post.id, author: a.actor, body });
  // The author and everyone already in the thread hear about new replies.
  await notify(db, {
    workspaceId: a.workspaceId, kind: 'post.commented', title: `${a.actor} 在「${post.title}」留言`, body, href: `/app/approvals?post=${post.id}`,
    emails: [post.createdBy, ...earlier.map((c) => c.author)], actor: a.actor,
  });
}
