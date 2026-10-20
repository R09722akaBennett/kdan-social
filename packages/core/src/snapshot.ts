import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { accountContext, decrypt } from './crypto';
import { connectedAccounts, followerSnapshots, postMetrics, publishTasks, type Db } from './db/index';
import { PlatformError } from './platforms/http';
import { lineInsightDay } from './platforms/line';
import type { PlatformClient } from './platforms/types';
import type { Clients } from './publish/dispatch';

export type SnapshotSummary = { saved: number; notReady: number; expired: number; failed: number };

/**
 * Record today's follower count for every active account.
 *
 * Doubles as the daily token check: an account whose platform rejects the token is
 * marked expired here, before a scheduled post finds out the hard way. Re-running on
 * the same day overwrites that day's number.
 */
export async function snapshotFollowers(opts: { db: Db; clients: Clients; key: Buffer; now?: Date; log?: (line: string) => void }): Promise<SnapshotSummary> {
  const { db, log = () => {} } = opts;
  const now = opts.now ?? new Date();
  const summary: SnapshotSummary = { saved: 0, notReady: 0, expired: 0, failed: 0 };
  const accounts = await db.select().from(connectedAccounts).where(eq(connectedAccounts.status, 'active'));

  for (const a of accounts) {
    // LINE reports yesterday (Japan time); Meta reports the live number.
    const day = a.platform === 'line' ? lineInsightDay(now).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : now.toISOString().slice(0, 10);
    try {
      const credentials = JSON.parse(decrypt(a.credentials, opts.key, accountContext(a)));
      const client = opts.clients[a.platform] as PlatformClient<unknown>;
      const followers = await client.followers({ externalId: a.externalId, credentials }, now);
      await db.update(connectedAccounts).set({ lastCheckedAt: now }).where(eq(connectedAccounts.id, a.id));
      if (followers === null) {
        summary.notReady++;
        continue;
      }
      await db
        .insert(followerSnapshots)
        .values({ accountId: a.id, day, followers })
        .onConflictDoUpdate({ target: [followerSnapshots.accountId, followerSnapshots.day], set: { followers, createdAt: sql`now()` } });
      summary.saved++;
    } catch (e) {
      if (e instanceof PlatformError && e.kind === 'auth') {
        await db.update(connectedAccounts).set({ status: 'expired', statusDetail: e.message, lastCheckedAt: now }).where(eq(connectedAccounts.id, a.id));
        log(`Account ${a.name} (${a.platform}) authorization expired: ${e.message}`);
        summary.expired++;
      } else {
        log(`Follower snapshot failed for ${a.name} (${a.platform}): ${e instanceof Error ? e.message : String(e)}`);
        summary.failed++;
      }
    }
  }
  return summary;
}

export type MetricsSummary = { saved: number; failed: number };
// Posts gather nearly all their engagement in the first weeks; older ones are not re-read.
const METRICS_WINDOW_MS = 30 * 86_400_000;

/**
 * Refresh the numbers of every post published in the last 30 days.
 *
 * One post's failure is logged and skipped; an auth failure is left for the follower
 * snapshot to report, so this never marks an account expired by itself.
 */
export async function collectPostMetrics(opts: { db: Db; clients: Clients; key: Buffer; now?: Date; log?: (line: string) => void }): Promise<MetricsSummary> {
  const { db, log = () => {} } = opts;
  const now = opts.now ?? new Date();
  const summary: MetricsSummary = { saved: 0, failed: 0 };
  const rows = await db.select({ task: publishTasks, account: connectedAccounts }).from(publishTasks)
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .where(and(eq(publishTasks.status, 'published'), isNotNull(publishTasks.externalPostId), gte(publishTasks.finishedAt, new Date(now.getTime() - METRICS_WINDOW_MS)), eq(connectedAccounts.status, 'active')));
  for (const { task, account } of rows) {
    try {
      const credentials = JSON.parse(decrypt(account.credentials, opts.key, accountContext(account)));
      const client = opts.clients[account.platform] as PlatformClient<unknown>;
      const m = await client.metrics({ externalId: account.externalId, credentials }, task.externalPostId!);
      const values = { engagements: m.engagements, opens: m.opens ?? null, detail: m.detail, fetchedAt: now };
      await db.insert(postMetrics).values({ taskId: task.id, ...values }).onConflictDoUpdate({ target: postMetrics.taskId, set: values });
      summary.saved++;
    } catch (e) {
      log(`Post metrics failed for task ${task.id} on ${account.platform} ${account.name}: ${e instanceof Error ? e.message : String(e)}`);
      summary.failed++;
    }
  }
  return summary;
}
