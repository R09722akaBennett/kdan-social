import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { accountContext, decrypt } from './crypto';
import { accountPosts, connectedAccounts, followerSnapshots, postMetrics, publishTasks, type Db } from './db/index';
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

export type ImportSummary = { accounts: number; posts: number; failed: number };
/** How far back an account's own posts are read, on connect and every day after. */
export const IMPORT_WINDOW_DAYS = 60;

/**
 * Read the last 60 days of posts from Facebook and Instagram accounts, whoever published
 * them, and store them with their current numbers. Re-reading updates the numbers.
 *
 * Args:
 *   accountIds: only these accounts, as right after connecting; all active ones otherwise.
 */
export async function importAccountPosts(opts: { db: Db; clients: Clients; key: Buffer; accountIds?: string[]; now?: Date; log?: (line: string) => void }): Promise<ImportSummary> {
  const { db, log = () => {} } = opts;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - IMPORT_WINDOW_DAYS * 86_400_000);
  const summary: ImportSummary = { accounts: 0, posts: 0, failed: 0 };
  const accounts = await db.select().from(connectedAccounts)
    .where(and(eq(connectedAccounts.status, 'active'), inArray(connectedAccounts.platform, ['facebook', 'instagram']), opts.accountIds ? inArray(connectedAccounts.id, opts.accountIds) : undefined));
  for (const a of accounts) {
    try {
      const credentials = JSON.parse(decrypt(a.credentials, opts.key, accountContext(a)));
      const client = opts.clients[a.platform] as PlatformClient<unknown>;
      const posts = (await client.recentPosts?.({ externalId: a.externalId, credentials }, since)) ?? [];
      for (const p of posts) {
        const values = { publishedAt: p.publishedAt, text: p.text.slice(0, 2000), permalink: p.permalink, mediaType: p.mediaType, engagements: p.metrics.engagements, detail: p.metrics.detail, fetchedAt: now };
        await db.insert(accountPosts).values({ accountId: a.id, externalId: p.externalId, ...values })
          .onConflictDoUpdate({ target: [accountPosts.accountId, accountPosts.externalId], set: values });
      }
      summary.accounts++;
      summary.posts += posts.length;
    } catch (e) {
      log(`Post import failed for ${a.name} (${a.platform}): ${e instanceof Error ? e.message : String(e)}`);
      summary.failed++;
    }
  }
  return summary;
}
