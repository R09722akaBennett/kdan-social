import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { accountGroups, connectedAccounts, followerSnapshots, postMetrics, postVariants, posts, publishTasks, type Db } from './db/index';
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
