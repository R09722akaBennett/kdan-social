import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import { accountContext, decrypt, DecryptError } from '../crypto';
import {
  auditLog,
  connectedAccounts,
  markets,
  postVariants,
  posts,
  publishTasks,
  workspaces,
  type Db,
} from '../db/index';
import { PlatformError } from '../platforms/http';
import type { LineClient } from '../platforms/line';
import type { FacebookCredentials, PlatformClient } from '../platforms/types';
import { publishingAllowed } from '../writes';

export type Clients = {
  facebook: PlatformClient<FacebookCredentials>;
  instagram: PlatformClient<FacebookCredentials>;
  line: LineClient;
};

export type DispatchOptions = {
  db: Db;
  clients: Clients;
  key: Buffer;
  globalEnabled: boolean;
  now?: Date;
  limit?: number;
  log?: (line: string) => void;
};

type Outcome = 'published' | 'dry_run' | 'failed' | 'needs_check' | 'missed' | 'retrying';
export type DispatchSummary = Record<Outcome, number> & { recovered: number };

export const MAX_ATTEMPTS = 3;
// A task still `running` after this long belonged to an invocation that died mid-publish.
const STALE_MS = 10 * 60_000;
const backoffMs = (attempt: number) => 60_000 * 2 ** (attempt - 1);

/**
 * Publish every task whose time has come, once.
 *
 * Safe to call from overlapping cron invocations: tasks are claimed with
 * `FOR UPDATE SKIP LOCKED`, so each is taken by exactly one caller.
 *
 * Returns:
 *   How many tasks ended in each outcome, plus how many stuck tasks were set aside.
 */
export async function dispatchDue(opts: DispatchOptions): Promise<DispatchSummary> {
  const { db, limit = 20, log = () => {} } = opts;
  const now = opts.now ?? new Date();
  const summary: DispatchSummary = { published: 0, dry_run: 0, failed: 0, needs_check: 0, missed: 0, retrying: 0, recovered: 0 };

  // We cannot tell whether a dead invocation published before it died, so a human checks
  // instead of a retry risking a second copy on the customer's page.
  const stale = await db
    .update(publishTasks)
    .set({ status: 'needs_check', lastError: 'The publish was interrupted; check the page before retrying', finishedAt: now })
    .where(and(eq(publishTasks.status, 'running'), lt(publishTasks.startedAt, new Date(now.getTime() - STALE_MS))))
    .returning({ id: publishTasks.id });
  summary.recovered = stale.length;
  for (const s of stale) log(`Task ${s.id} was interrupted mid-publish; marked needs_check`);

  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: publishTasks.id })
      .from(publishTasks)
      .where(and(eq(publishTasks.status, 'scheduled'), lte(publishTasks.runAt, now)))
      .orderBy(publishTasks.runAt)
      .limit(limit)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(publishTasks)
      .set({ status: 'running', startedAt: now, attempts: sql`${publishTasks.attempts} + 1` })
      .where(inArray(publishTasks.id, due.map((d) => d.id)))
      .returning({ id: publishTasks.id });
  });

  for (const { id } of claimed) summary[await runOne(opts, id, now, log)]++;
  return summary;
}

async function runOne(opts: DispatchOptions, taskId: string, now: Date, log: (line: string) => void): Promise<Outcome> {
  const { db } = opts;
  const [row] = await db
    .select({ task: publishTasks, variant: postVariants, post: posts, market: markets, account: connectedAccounts, workspace: workspaces })
    .from(publishTasks)
    .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .innerJoin(posts, eq(posts.id, postVariants.postId))
    .innerJoin(markets, eq(markets.id, postVariants.marketId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .innerJoin(workspaces, eq(workspaces.id, connectedAccounts.workspaceId))
    .where(eq(publishTasks.id, taskId));
  if (!row) return 'failed';
  const { task, variant, post, market, account, workspace } = row;
  const where = `"${post.title}" to ${account.platform} ${account.name} (${market.code})`;

  const finish = async (status: 'published' | 'dry_run' | 'failed' | 'needs_check' | 'missed', fields: { lastError?: string; externalPostId?: string } = {}) => {
    await db.update(publishTasks).set({ status, finishedAt: now, lastError: fields.lastError ?? null, externalPostId: fields.externalPostId ?? null }).where(eq(publishTasks.id, taskId));
    await db.insert(auditLog).values({
      workspaceId: workspace.id,
      actor: 'system:dispatcher',
      action: `publish.${status}`,
      target: taskId,
      detail: { post: post.title, account: account.name, platform: account.platform, market: market.code, ...fields },
    });
    return status;
  };

  if (market.requiresReview && variant.reviewStatus !== 'approved') {
    log(`Skipped ${where}: not approved before its scheduled time`);
    return finish('missed', { lastError: 'Not approved before its scheduled time' });
  }
  if (account.platform !== variant.platform) {
    return finish('failed', { lastError: `Task pairs a ${variant.platform} version with a ${account.platform} account` });
  }
  if (account.status !== 'active') {
    log(`Failed ${where}: account authorization is ${account.status}`);
    return finish('failed', { lastError: 'The account authorization has expired; reconnect the account' });
  }
  if (!publishingAllowed(opts.globalEnabled, workspace)) {
    log(`[dry-run] Will publish ${where} with ${variant.media.length} media item(s)`);
    return finish('dry_run');
  }

  const expire = (detail: string) =>
    db.update(connectedAccounts).set({ status: 'expired', statusDetail: detail, lastCheckedAt: now }).where(eq(connectedAccounts.id, account.id));

  let credentials: unknown;
  try {
    credentials = JSON.parse(decrypt(account.credentials, opts.key, accountContext(account)));
  } catch (e) {
    const message = e instanceof DecryptError ? e.message : 'Saved credentials are unreadable; reconnect the account';
    await expire(message);
    return finish('failed', { lastError: message });
  }

  const client = opts.clients[account.platform] as PlatformClient<unknown>;
  try {
    const res = await client.publish(
      { externalId: account.externalId, credentials },
      { body: variant.body, media: variant.media, idempotencyKey: taskId },
    );
    log(`Published ${where} as ${res.externalPostId}`);
    return finish('published', { externalPostId: res.externalPostId });
  } catch (e) {
    if (!(e instanceof PlatformError)) {
      // An unexpected error may come after the platform accepted the post.
      log(`Failed ${where} with an unexpected error: ${String(e)}`);
      return finish('needs_check', { lastError: `Unexpected error: ${e instanceof Error ? e.message : String(e)}` });
    }
    log(`Failed ${where}: ${e.kind}: ${e.message}`);
    switch (e.kind) {
      case 'auth':
        await expire(e.message);
        return finish('failed', { lastError: e.message });
      case 'rate_limited':
      case 'transient':
        // `attempts` was incremented when the task was claimed, so it counts this try.
        if (task.attempts < MAX_ATTEMPTS) {
          const runAt = new Date(now.getTime() + backoffMs(task.attempts));
          await db.update(publishTasks).set({ status: 'scheduled', runAt, lastError: e.message }).where(eq(publishTasks.id, taskId));
          return 'retrying';
        }
        return finish('failed', { lastError: `${e.message} (gave up after ${MAX_ATTEMPTS} attempts)` });
      case 'invalid':
        return finish('failed', { lastError: e.message });
      case 'unknown_outcome':
        return finish('needs_check', { lastError: e.message });
    }
  }
}
