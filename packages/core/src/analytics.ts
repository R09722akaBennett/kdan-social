import { and, asc, desc, eq, gte, notExists } from 'drizzle-orm';
import { accountGroups, accountPosts, connectedAccounts, followerSnapshots, postMetrics, postVariants, posts, publishTasks, type Db } from './db/index';
import { inGroups, type GroupFilter } from './overview';

/** Each account's daily follower counts from `days` ago until now, oldest first. */
export async function followerSeries(db: Db, a: { workspaceId: string; days: number; now?: Date }) {
  const since = new Date((a.now ?? new Date()).getTime() - a.days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.select({ accountId: followerSnapshots.accountId, day: followerSnapshots.day, followers: followerSnapshots.followers })
    .from(followerSnapshots).innerJoin(connectedAccounts, eq(connectedAccounts.id, followerSnapshots.accountId))
    .where(and(eq(connectedAccounts.workspaceId, a.workspaceId), gte(followerSnapshots.day, since)))
    .orderBy(asc(followerSnapshots.day));
  const out = new Map<string, Array<{ day: string; followers: number }>>();
  for (const r of rows) out.set(r.accountId, [...(out.get(r.accountId) ?? []), { day: r.day, followers: r.followers }]);
  return out;
}

/**
 * Published posts since `from`, one row per account, newest first, with their latest
 * numbers. A row without numbers has not been read yet (they refresh daily).
 */
export function postPerformance(db: Db, a: { workspaceId: string; from: Date; groupIds?: GroupFilter; limit?: number }) {
  return db
    .select({
      postId: posts.id, title: posts.title, taskId: publishTasks.id, publishedAt: publishTasks.finishedAt, externalPostId: publishTasks.externalPostId,
      accountId: connectedAccounts.id, account: connectedAccounts.name, platform: connectedAccounts.platform, groupName: accountGroups.name,
      engagements: postMetrics.engagements, opens: postMetrics.opens, detail: postMetrics.detail, fetchedAt: postMetrics.fetchedAt,
    })
    .from(publishTasks)
    .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .innerJoin(posts, eq(posts.id, postVariants.postId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId))
    .leftJoin(postMetrics, eq(postMetrics.taskId, publishTasks.id))
    .where(and(eq(posts.workspaceId, a.workspaceId), eq(publishTasks.status, 'published'), gte(publishTasks.finishedAt, a.from), inGroups(a.groupIds)))
    .orderBy(desc(publishTasks.finishedAt))
    .limit(a.limit ?? 100);
}

export type PerformanceRow = {
  key: string;
  source: 'kdan' | 'platform';
  title: string;
  publishedAt: Date | null;
  accountId: string;
  account: string;
  platform: 'facebook' | 'instagram' | 'line';
  groupName: string | null;
  engagements: number | null;
  opens: number | null;
  detail: Record<string, number | null> | null;
  fetchedAt: Date | null;
  permalink: string | null;
};

/**
 * Every post since `from`, newest first: those sent by kdan-social with their collected
 * numbers, plus those read back from the accounts that kdan-social did not send.
 */
export async function performanceRows(db: Db, a: { workspaceId: string; from: Date; groupIds?: GroupFilter; limit?: number }): Promise<PerformanceRow[]> {
  const limit = a.limit ?? 100;
  const [own, imported] = await Promise.all([
    postPerformance(db, { ...a, limit }),
    db.select({ post: accountPosts, account: connectedAccounts.name, platform: connectedAccounts.platform, groupName: accountGroups.name })
      .from(accountPosts)
      .innerJoin(connectedAccounts, eq(connectedAccounts.id, accountPosts.accountId))
      .leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId))
      .where(and(
        eq(connectedAccounts.workspaceId, a.workspaceId), gte(accountPosts.publishedAt, a.from), inGroups(a.groupIds),
        // A post kdan-social sent already has its own row, with numbers collected per task.
        notExists(db.select({ id: publishTasks.id }).from(publishTasks).where(and(eq(publishTasks.accountId, accountPosts.accountId), eq(publishTasks.externalPostId, accountPosts.externalId)))),
      ))
      .orderBy(desc(accountPosts.publishedAt))
      .limit(limit),
  ]);
  const rows: PerformanceRow[] = [
    ...own.map((p) => ({ key: p.taskId, source: 'kdan' as const, title: p.title, publishedAt: p.publishedAt, accountId: p.accountId, account: p.account, platform: p.platform, groupName: p.groupName, engagements: p.engagements, opens: p.opens, detail: p.detail, fetchedAt: p.fetchedAt, permalink: null })),
    ...imported.map(({ post, account, platform, groupName }) => ({
      key: post.id, source: 'platform' as const, title: (post.text.split('\n')[0] ?? '').slice(0, 60) || '（沒有文字）', publishedAt: post.publishedAt, accountId: post.accountId,
      account, platform, groupName, engagements: post.engagements, opens: null, detail: post.detail, fetchedAt: post.fetchedAt, permalink: post.permalink,
    })),
  ];
  return rows.sort((x, y) => (y.publishedAt?.getTime() ?? 0) - (x.publishedAt?.getTime() ?? 0)).slice(0, limit);
}
