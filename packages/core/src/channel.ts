import { and, asc, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { connectedAccounts, postVariants, posts, publishTasks, type Db } from './db/index';
import { listDrafts } from './posts';

export type ChannelTab = 'queue' | 'drafts' | 'approvals' | 'sent';

const SENT = ['published', 'dry_run', 'failed', 'needs_check', 'missed'] as const;
const SENT_LIMIT = 50;

// One account's page splits its tasks the way Buffer's channel tabs do: what will go out,
// what waits for a reviewer, and what already ran. Cancelled tasks are in none of them.
const TABS: Record<Exclude<ChannelTab, 'drafts'>, SQL> = {
  queue: and(inArray(publishTasks.status, ['scheduled', 'running']), eq(postVariants.reviewStatus, 'approved'))!,
  approvals: and(eq(publishTasks.status, 'scheduled'), inArray(postVariants.reviewStatus, ['pending', 'changes_requested']))!,
  sent: inArray(publishTasks.status, [...SENT]),
};

/** One account, or null when it is not in the workspace. */
export async function channelAccount(db: Db, a: { workspaceId: string; accountId: string }) {
  if (!/^[0-9a-f-]{36}$/.test(a.accountId)) return null;
  const [row] = await db.select().from(connectedAccounts).where(and(eq(connectedAccounts.id, a.accountId), eq(connectedAccounts.workspaceId, a.workspaceId)));
  return row ?? null;
}

/** How many posts each tab of an account's page holds. `sent` counts all, not only the listed ones. */
export async function channelCounts(db: Db, a: { workspaceId: string; accountId: string }): Promise<Record<ChannelTab, number>> {
  const counts = await Promise.all((Object.keys(TABS) as Array<keyof typeof TABS>).map(async (tab) => {
    const [row] = await db.select({ n: count() }).from(publishTasks)
      .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
      .innerJoin(posts, eq(posts.id, postVariants.postId))
      .where(and(eq(posts.workspaceId, a.workspaceId), eq(publishTasks.accountId, a.accountId), TABS[tab]));
    return [tab, row?.n ?? 0] as const;
  }));
  const drafts = await listDrafts(db, a);
  return { ...Object.fromEntries(counts), drafts: drafts.length } as Record<ChannelTab, number>;
}

export type ChannelItem = {
  postId: string;
  title: string;
  body: string;
  media: (typeof postVariants.$inferSelect)['media'];
  createdBy: string | null;
  /** Null for a draft, which has no time yet. */
  runAt: Date | null;
  status: (typeof publishTasks.$inferSelect)['status'] | 'draft';
  review: (typeof postVariants.$inferSelect)['reviewStatus'];
  lastError: string | null;
  externalPostId: string | null;
  /** Why the first comment did not go up, when the post did. */
  commentError: string | null;
};

/**
 * The posts in one tab of an account's page, with this account's own text: soonest first
 * for what is still to come, newest first for drafts and for the last 50 sent.
 */
export async function channelItems(db: Db, a: { workspaceId: string; accountId: string; tab: ChannelTab }): Promise<ChannelItem[]> {
  if (a.tab === 'drafts') {
    const drafts = await listDrafts(db, a);
    return drafts.map(({ post, versions }) => {
      const v = versions.find((x) => x.accountId === a.accountId)!;
      return { postId: post.id, title: post.title, body: v.body, media: v.media, createdBy: post.createdBy, runAt: null, status: 'draft', review: 'draft', lastError: null, externalPostId: null, commentError: null };
    });
  }
  const sent = a.tab === 'sent';
  const q = db
    .select({
      postId: posts.id, title: posts.title, body: postVariants.body, media: postVariants.media, createdBy: posts.createdBy,
      runAt: publishTasks.runAt, status: publishTasks.status, review: postVariants.reviewStatus, lastError: publishTasks.lastError, externalPostId: publishTasks.externalPostId,
      commentError: publishTasks.commentError,
    })
    .from(publishTasks)
    .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .innerJoin(posts, eq(posts.id, postVariants.postId))
    .where(and(eq(posts.workspaceId, a.workspaceId), eq(publishTasks.accountId, a.accountId), TABS[a.tab]))
    .orderBy(sent ? desc(publishTasks.runAt) : asc(publishTasks.runAt));
  return sent ? q.limit(SENT_LIMIT) : q;
}
