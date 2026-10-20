import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import { accountContext, decrypt, encrypt } from './crypto';
import {
  auditLog,
  connectedAccounts,
  markets,
  metaConnectSessions,
  postVariants,
  posts,
  publishTasks,
  workspaceMembers,
  workspaces,
  type Db,
} from './db/index';
import { PlatformError } from './platforms/http';
import type { LineAudience, LineClient, LineQuota } from './platforms/line';
import type { MetaPage } from './platforms/meta-oauth';
import { publishingAllowed } from './writes';

export class AccessError extends Error {}
/** A connection problem whose message is shown to the user as is. */
export class ConnectError extends Error {}

const CONNECT_TTL_MS = 15 * 60_000;

/** The workspace a user belongs to, or null when they have not been added to any. */
export async function membershipFor(db: Db, userId: string) {
  const [row] = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.createdAt)
    .limit(1);
  return row ?? null;
}

export function listMarkets(db: Db, workspaceId: string) {
  return db.select().from(markets).where(eq(markets.workspaceId, workspaceId)).orderBy(markets.createdAt);
}

/** Connected accounts without their credentials, which never leave the server. */
export function listAccounts(db: Db, workspaceId: string) {
  return db
    .select({
      id: connectedAccounts.id,
      marketId: connectedAccounts.marketId,
      platform: connectedAccounts.platform,
      externalId: connectedAccounts.externalId,
      name: connectedAccounts.name,
      status: connectedAccounts.status,
      statusDetail: connectedAccounts.statusDetail,
      lastCheckedAt: connectedAccounts.lastCheckedAt,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.workspaceId, workspaceId))
    .orderBy(connectedAccounts.createdAt);
}

export function recentTasks(db: Db, workspaceId: string, limit = 20) {
  return db
    .select({
      id: publishTasks.id,
      status: publishTasks.status,
      runAt: publishTasks.runAt,
      finishedAt: publishTasks.finishedAt,
      lastError: publishTasks.lastError,
      title: posts.title,
      account: connectedAccounts.name,
      platform: connectedAccounts.platform,
    })
    .from(publishTasks)
    .innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId))
    .innerJoin(posts, eq(posts.id, postVariants.postId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, publishTasks.accountId))
    .where(eq(posts.workspaceId, workspaceId))
    .orderBy(desc(publishTasks.createdAt))
    .limit(limit);
}

const sessionContext = (id: string) => `meta_connect:${id}`;

/** Hold the pages from one authorization for the user to choose from; returns the session id. */
export async function startMetaConnect(db: Db, key: Buffer, a: { workspaceId: string; userId: string; pages: MetaPage[]; now?: Date }) {
  const now = a.now ?? new Date();
  await db.delete(metaConnectSessions).where(lte(metaConnectSessions.expiresAt, now));
  const id = randomUUID();
  await db.insert(metaConnectSessions).values({
    id,
    workspaceId: a.workspaceId,
    userId: a.userId,
    payload: encrypt(JSON.stringify(a.pages), key, sessionContext(id)),
    expiresAt: new Date(now.getTime() + CONNECT_TTL_MS),
  });
  return id;
}

async function loadSession(db: Db, key: Buffer, a: { sessionId: string; workspaceId: string; userId: string; now?: Date }) {
  const [s] = await db
    .select()
    .from(metaConnectSessions)
    .where(and(
      eq(metaConnectSessions.id, a.sessionId),
      eq(metaConnectSessions.workspaceId, a.workspaceId),
      eq(metaConnectSessions.userId, a.userId),
      gt(metaConnectSessions.expiresAt, a.now ?? new Date()),
    ));
  return s ? (JSON.parse(decrypt(s.payload, key, sessionContext(s.id))) as MetaPage[]) : null;
}

/**
 * The pages waiting in a session, without their tokens, or null when the session is
 * gone, expired, or belongs to someone else.
 */
export async function pendingMetaConnect(db: Db, key: Buffer, a: { sessionId: string; workspaceId: string; userId: string; now?: Date }) {
  const pages = await loadSession(db, key, a);
  return pages?.map(({ token: _token, ...p }) => p) ?? null;
}

export type ConnectSelection = { pageId: string; marketId: string; instagram: boolean };

/**
 * Save the chosen pages, and their linked Instagram accounts when asked, as connected accounts.
 *
 * An account that was already connected gets the new token and becomes active again,
 * so this is also how an expired account is reconnected.
 *
 * Raises:
 *   AccessError: the session is gone or not this user's, or a market is not in the workspace.
 */
export async function completeMetaConnect(db: Db, key: Buffer, a: { sessionId: string; workspaceId: string; userId: string; actor: string; selections: ConnectSelection[]; now?: Date }) {
  const pages = await loadSession(db, key, a);
  if (!pages) throw new AccessError('This authorization has expired; connect again');
  const marketIds = new Set((await listMarkets(db, a.workspaceId)).map((m) => m.id));

  let connected = 0;
  for (const sel of a.selections) {
    const page = pages.find((p) => p.id === sel.pageId);
    if (!page) continue;
    if (!marketIds.has(sel.marketId)) throw new AccessError('Unknown market');
    const targets: Array<{ platform: 'facebook' | 'instagram'; externalId: string; name: string }> = [{ platform: 'facebook', externalId: page.id, name: page.name }];
    if (sel.instagram && page.instagram) targets.push({ platform: 'instagram' as const, externalId: page.instagram.id, name: `@${page.instagram.username}` });
    for (const t of targets) {
      const ref = { workspaceId: a.workspaceId, platform: t.platform, externalId: t.externalId };
      const credentials = encrypt(JSON.stringify({ pageAccessToken: page.token }), key, accountContext(ref));
      await db
        .insert(connectedAccounts)
        .values({ ...ref, marketId: sel.marketId, name: t.name, credentials })
        .onConflictDoUpdate({
          target: [connectedAccounts.workspaceId, connectedAccounts.platform, connectedAccounts.externalId],
          set: { marketId: sel.marketId, name: t.name, credentials, status: 'active', statusDetail: null },
        });
      await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'account.connected', target: t.externalId, detail: { platform: t.platform, name: t.name } });
      connected++;
    }
  }
  await db.delete(metaConnectSessions).where(eq(metaConnectSessions.id, a.sessionId));
  return { connected };
}

/**
 * Queue a test post for one account, due now, to watch it go through as a dry run.
 *
 * Raises:
 *   AccessError: publishing is switched on for this workspace (the test would go out
 *     for real), or the account is not in the workspace.
 */
export async function queueDryRunTest(db: Db, a: { workspaceId: string; accountId: string; globalEnabled: boolean; actor: string; now?: Date }) {
  const [row] = await db
    .select({ account: connectedAccounts, workspace: workspaces })
    .from(connectedAccounts)
    .innerJoin(workspaces, eq(workspaces.id, connectedAccounts.workspaceId))
    .where(and(eq(connectedAccounts.id, a.accountId), eq(connectedAccounts.workspaceId, a.workspaceId)));
  if (!row) throw new AccessError('Unknown account');
  if (publishingAllowed(a.globalEnabled, row.workspace)) throw new AccessError('Publishing is on; a test post would go out for real');

  const [post] = await db.insert(posts).values({ workspaceId: a.workspaceId, title: '測試貼文（dry-run）' }).returning();
  const [variant] = await db.insert(postVariants).values({
    postId: post!.id,
    marketId: row.account.marketId,
    platform: row.account.platform,
    body: 'kdan-social 測試貼文：只會記錄為 dry-run，不會真的發出。',
    reviewStatus: 'approved',
  }).returning();
  const [task] = await db.insert(publishTasks).values({ variantId: variant!.id, accountId: row.account.id, runAt: a.now ?? new Date() }).returning();
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'test.queued', target: task!.id, detail: { account: row.account.name } });
  return task!.id;
}

/** Create a workspace with its markets and first owner. Used once per customer. */
export async function bootstrapWorkspace(db: Db, a: { name: string; owner: { userId: string; email: string }; markets: Array<{ code: string; name: string; locale: string; timeZone: string }> }) {
  return db.transaction(async (tx) => {
    const [ws] = await tx.insert(workspaces).values({ name: a.name }).returning();
    await tx.insert(markets).values(a.markets.map((m) => ({ ...m, workspaceId: ws!.id })));
    await tx.insert(workspaceMembers).values({ workspaceId: ws!.id, userId: a.owner.userId, email: a.owner.email, role: 'owner' });
    await tx.insert(auditLog).values({ workspaceId: ws!.id, actor: a.owner.email, action: 'workspace.created', target: ws!.id });
    return ws!;
  });
}


/**
 * Connect a LINE Official Account from its Messaging API channel ID and secret.
 *
 * The credentials are checked with LINE before anything is saved, and the account's
 * name comes from LINE, so a typo cannot create a dead account. Connecting the same
 * channel again replaces its secret and reactivates it.
 *
 * Raises:
 *   ConnectError: the market is not in the workspace, LINE rejects the credentials, or LINE is unreachable.
 */
export async function connectLine(db: Db, key: Buffer, line: LineClient, a: { workspaceId: string; marketId: string; channelId: string; channelSecret: string; actor: string }) {
  const channelId = a.channelId.trim();
  const channelSecret = a.channelSecret.trim();
  if (!/^\d+$/.test(channelId) || !channelSecret) throw new ConnectError('請填入 Channel ID（純數字）與 Channel secret。');
  if (!(await listMarkets(db, a.workspaceId)).some((m) => m.id === a.marketId)) throw new ConnectError('找不到這個市場，請重新整理後再試。');

  let info;
  try {
    info = await line.botInfo({ channelId, channelSecret });
  } catch (e) {
    if (e instanceof PlatformError && e.kind === 'auth') throw new ConnectError('LINE 不接受這組 Channel ID 與 Channel secret，請確認是 Messaging API channel 的值。');
    throw new ConnectError('暫時連不到 LINE，請稍後再試。');
  }
  const ref = { workspaceId: a.workspaceId, platform: 'line' as const, externalId: channelId };
  const name = info.basicId ? `${info.displayName}（${info.basicId}）` : info.displayName || `LINE ${channelId}`;
  const credentials = encrypt(JSON.stringify({ channelId, channelSecret }), key, accountContext(ref));
  await db
    .insert(connectedAccounts)
    .values({ ...ref, marketId: a.marketId, name, credentials })
    .onConflictDoUpdate({
      target: [connectedAccounts.workspaceId, connectedAccounts.platform, connectedAccounts.externalId],
      set: { marketId: a.marketId, name, credentials, status: 'active', statusDetail: null },
    });
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'account.connected', target: channelId, detail: { platform: 'line', name } });
  return { name };
}

export type LineUsage = { accountId: string; name: string; quota: LineQuota | null; audience: LineAudience | null; error: string | null };

/**
 * This month's quota and yesterday's reachable friends for each active LINE account.
 *
 * A broadcast costs one message per reachable friend, so these two numbers are what the
 * composer needs to warn before a post would run the quota out. Failures are reported
 * per account instead of failing the page; a rejected secret marks the account expired.
 */
export async function lineUsage(db: Db, key: Buffer, line: LineClient, a: { workspaceId: string; now?: Date }): Promise<LineUsage[]> {
  const now = a.now ?? new Date();
  const accounts = await db.select().from(connectedAccounts).where(and(eq(connectedAccounts.workspaceId, a.workspaceId), eq(connectedAccounts.platform, 'line'), eq(connectedAccounts.status, 'active')));
  return Promise.all(accounts.map(async (acc): Promise<LineUsage> => {
    const base = { accountId: acc.id, name: acc.name };
    try {
      const ref = { externalId: acc.externalId, credentials: JSON.parse(decrypt(acc.credentials, key, accountContext(acc))) };
      const [quota, audience] = await Promise.all([line.quota(ref), line.audience(ref, now)]);
      return { ...base, quota, audience, error: null };
    } catch (e) {
      if (e instanceof PlatformError && e.kind === 'auth') {
        await db.update(connectedAccounts).set({ status: 'expired', statusDetail: e.message, lastCheckedAt: now }).where(eq(connectedAccounts.id, acc.id));
        return { ...base, quota: null, audience: null, error: '授權失效，請重新連結。' };
      }
      return { ...base, quota: null, audience: null, error: '暫時讀不到 LINE 的用量。' };
    }
  }));
}
