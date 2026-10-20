import { eq, sql } from 'drizzle-orm';
import { accountContext, decrypt } from './crypto';
import { connectedAccounts, followerSnapshots, type Db } from './db/index';
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
