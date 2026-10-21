import { and, asc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { accountGroups, connectedAccounts, followerSnapshots, postVariants, posts, publishTasks, type Db } from './db/index';
import { zonedTimeToUtc } from './time';
import { inTags, type TagFilter } from './tags';

export type FollowerStat = { followers: number; day: string; delta7: number | null };

/**
 * Each account's latest follower count and its change over the previous week.
 *
 * `delta7` compares with the newest snapshot at least seven days older, so it is null
 * until the account has been snapshotted for a week.
 */
export async function followerStats(db: Db, workspaceId: string): Promise<Map<string, FollowerStat>> {
  const rows = await db
    .select({ accountId: followerSnapshots.accountId, day: followerSnapshots.day, followers: followerSnapshots.followers })
    .from(followerSnapshots)
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, followerSnapshots.accountId))
    .where(and(eq(connectedAccounts.workspaceId, workspaceId), gte(followerSnapshots.day, sql`current_date - 40`)))
    .orderBy(asc(followerSnapshots.day));
  const byAccount = new Map<string, Array<{ day: string; followers: number }>>();
  for (const r of rows) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), r]);
  const out = new Map<string, FollowerStat>();
  for (const [id, list] of byAccount) {
    const latest = list[list.length - 1]!;
    const cutoff = new Date(`${latest.day}T00:00:00Z`).getTime() - 7 * 86_400_000;
    const base = [...list].reverse().find((r) => new Date(`${r.day}T00:00:00Z`).getTime() <= cutoff);
    out.set(id, { followers: latest.followers, day: latest.day, delta7: base ? latest.followers - base.followers : null });
  }
  return out;
}

/** Monday 00:00 of the week containing `now`, on the wall clock of `timeZone`. */
export function weekStart(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday!);
  const today = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!);
  const monday = new Date(today - back * 86_400_000).toISOString().slice(0, 10);
  return zonedTimeToUtc(monday, '00:00', timeZone);
}

/**
 * Accounts in any of `groupIds`, where null stands for ungrouped accounts.
 * Undefined or empty means every account.
 */
export type GroupFilter = Array<string | null> | undefined;

export function inGroups(groupIds: GroupFilter): SQL | undefined {
  if (!groupIds?.length) return undefined;
  const ids = groupIds.filter((g): g is string => g !== null);
  return or(ids.length ? inArray(connectedAccounts.groupId, ids) : undefined, groupIds.includes(null) ? isNull(connectedAccounts.groupId) : undefined);
}

/**
 * The numbers on the overview: what went out this week, what waits for review, and
 * what failed in the last seven days, optionally for some groups.
 */
export async function overviewCounts(db: Db, a: { workspaceId: string; now?: Date; groupIds?: GroupFilter; timeZone?: string }) {
  const now = a.now ?? new Date();
  const since = weekStart(now, a.timeZone ?? 'Asia/Taipei');
  const base = (extra: SQL | undefined) =>
    db
      .select({ posts: sql<number>`count(distinct ${posts.id})::int`, tasks: sql<number>`count(*)::int` })
      .from(publishTasks)
      .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
      .innerJoin(posts, eq(posts.id, postVariants.postId))
      .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
      .where(and(eq(posts.workspaceId, a.workspaceId), inGroups(a.groupIds), extra));
  const [published, pending, failed] = await Promise.all([
    base(and(eq(publishTasks.status, 'published'), gte(publishTasks.finishedAt, since))),
    base(and(eq(publishTasks.status, 'scheduled'), eq(postVariants.reviewStatus, 'pending'))),
    base(and(inArray(publishTasks.status, ['failed', 'needs_check']), gte(publishTasks.finishedAt, new Date(now.getTime() - 7 * 86_400_000)))),
  ]);
  return {
    weekStart: since,
    published: { posts: published[0]?.posts ?? 0, tasks: published[0]?.tasks ?? 0 },
    pendingReview: { posts: pending[0]?.posts ?? 0, tasks: pending[0]?.tasks ?? 0 },
    failed: { posts: failed[0]?.posts ?? 0, tasks: failed[0]?.tasks ?? 0 },
  };
}

export type ScheduledTask = {
  id: string;
  postId: string;
  title: string;
  runAt: Date;
  status: (typeof publishTasks.$inferSelect)['status'];
  review: (typeof postVariants.$inferSelect)['reviewStatus'];
  lastError: string | null;
  externalPostId: string | null;
  platform: 'facebook' | 'instagram' | 'line';
  account: string;
  accountStatus: (typeof connectedAccounts.$inferSelect)['status'];
  accountId: string;
  groupId: string | null;
  groupName: string | null;
  /** The account's own clock. */
  timeZone: string;
};

/** Tasks whose time falls in [from, to), oldest first, optionally for some groups. */
export function tasksBetween(db: Db, a: { workspaceId: string; from: Date; to: Date; groupIds?: GroupFilter; tagIds?: TagFilter; limit?: number; statuses?: ScheduledTask['status'][] }): Promise<ScheduledTask[]> {
  const q = db
    .select({
      id: publishTasks.id,
      postId: posts.id,
      title: posts.title,
      runAt: publishTasks.runAt,
      status: publishTasks.status,
      review: postVariants.reviewStatus,
      lastError: publishTasks.lastError,
      externalPostId: publishTasks.externalPostId,
      platform: connectedAccounts.platform,
      account: connectedAccounts.name,
      accountStatus: connectedAccounts.status,
      accountId: connectedAccounts.id,
      groupId: connectedAccounts.groupId,
      groupName: accountGroups.name,
      timeZone: connectedAccounts.timeZone,
    })
    .from(publishTasks)
    .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .innerJoin(posts, eq(posts.id, postVariants.postId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId))
    .where(and(
      eq(posts.workspaceId, a.workspaceId),
      inGroups(a.groupIds),
      inTags(db, a.tagIds),
      gte(publishTasks.runAt, a.from),
      lt(publishTasks.runAt, a.to),
      a.statuses ? inArray(publishTasks.status, a.statuses) : undefined,
    ))
    .orderBy(asc(publishTasks.runAt));
  return a.limit ? q.limit(a.limit) : q;
}

/** Tasks still waiting to go out, soonest first. */
export function upcomingTasks(db: Db, a: { workspaceId: string; now?: Date; groupIds?: GroupFilter; limit?: number }) {
  const now = a.now ?? new Date();
  return tasksBetween(db, { ...a, from: new Date(0), to: new Date(now.getTime() + 366 * 86_400_000), limit: a.limit ?? 8, statuses: ['scheduled', 'running'] });
}
