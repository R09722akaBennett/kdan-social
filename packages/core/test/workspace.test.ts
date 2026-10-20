import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, decrypt } from '../src/crypto';
import { auditLog, connectedAccounts, metaConnectSessions, publishTasks } from '../src/db/index';
import { createClients } from '../src/index';
import { exchangeCodeForPages, metaLoginUrl } from '../src/platforms/meta-oauth';
import { dispatchDue } from '../src/publish/dispatch';
import {
  AccessError,
  bootstrapWorkspace,
  completeMetaConnect,
  listAccounts,
  listMarkets,
  membershipFor,
  pendingMetaConnect,
  queueDryRunTest,
  recentTasks,
  startMetaConnect,
} from '../src/workspace';
import { fakeFetch, KEY, testDb } from './helpers';

const app = { appId: '158', appSecret: 'app-secret', redirectUri: 'https://kdan-social.vercel.app/api/meta/callback' };
const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'bennett@example.com' };
const stranger = '00000000-0000-4000-8000-000000000002';
const MARKETS = [
  { code: 'TW', name: '台灣', locale: 'zh-Hant-TW', timeZone: 'Asia/Taipei' },
  { code: 'JP', name: '日本', locale: 'ja-JP', timeZone: 'Asia/Tokyo' },
];
const PAGES = [
  { id: 'page-tw', name: 'KDAN Mobile 台灣', token: 'page-token-tw', instagram: { id: 'ig-tw', username: 'kdanmobile_tw' } },
  { id: 'page-jp', name: 'KDAN Mobile 日本', token: 'page-token-jp', instagram: null },
];

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN Mobile', owner, markets: MARKETS });
  const ms = await listMarkets(db, ws.id);
  return { db, ws, tw: ms.find((m) => m.code === 'TW')!, jp: ms.find((m) => m.code === 'JP')! };
}

describe('metaLoginUrl', () => {
  it('asks for every permission the pipeline needs', () => {
    const u = new URL(metaLoginUrl(app, 'state-1'));
    expect(u.searchParams.get('state')).toBe('state-1');
    expect(u.searchParams.get('redirect_uri')).toBe(app.redirectUri);
    expect(u.searchParams.get('scope')!.split(',')).toEqual(expect.arrayContaining(['pages_manage_posts', 'instagram_content_publish']));
  });
});

describe('exchangeCodeForPages', () => {
  it('exchanges for a long-lived token before reading pages, and follows paging', async () => {
    const f = fakeFetch()
      .on('GET', /oauth\/access_token\?.*code=/, { body: { access_token: 'short' } })
      .on('GET', /oauth\/access_token\?.*fb_exchange_token=/, { body: { access_token: 'long' } })
      .on('GET', /me\/accounts\?.*access_token=long/, { body: { data: [{ id: 'p1', name: 'A', access_token: 't1', instagram_business_account: { id: 'ig1', username: 'a' } }], paging: { next: 'https://graph.facebook.com/v25.0/me/accounts?after=x' } } })
      .on('GET', /me\/accounts\?after=x/, { body: { data: [{ id: 'p2', name: 'B', access_token: 't2' }] } });
    const pages = await exchangeCodeForPages(f.fn, app, 'the-code');
    expect(pages).toEqual([
      { id: 'p1', name: 'A', token: 't1', instagram: { id: 'ig1', username: 'a' } },
      { id: 'p2', name: 'B', token: 't2', instagram: null },
    ]);
  });

  it('keeps the code and secret out of the error when Meta rejects the code', async () => {
    const f = fakeFetch().on('GET', /oauth\/access_token/, { status: 400, body: { error: { code: 100, message: 'This authorization code has been used. code=the-code' } } });
    const e = await exchangeCodeForPages(f.fn, app, 'the-code').catch((err: Error) => err);
    expect(String(e)).not.toContain('the-code');
    expect(String(e)).not.toContain('app-secret');
  });
});

describe('meta connect', () => {
  it('shows pending pages without tokens, then saves the chosen ones encrypted', async () => {
    const { db, ws, tw, jp } = await setup();
    const sessionId = await startMetaConnect(db, KEY, { workspaceId: ws.id, userId: owner.userId, pages: PAGES });

    const pending = await pendingMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: owner.userId });
    expect(JSON.stringify(pending)).not.toContain('page-token');
    expect(pending).toHaveLength(2);

    const { connected } = await completeMetaConnect(db, KEY, {
      sessionId, workspaceId: ws.id, userId: owner.userId, actor: owner.email,
      selections: [{ pageId: 'page-tw', marketId: tw.id, instagram: true }, { pageId: 'page-jp', marketId: jp.id, instagram: true }],
    });
    expect(connected).toBe(3);
    const accounts = await listAccounts(db, ws.id);
    expect(accounts.map((a) => `${a.platform}:${a.name}`).sort()).toEqual(['facebook:KDAN Mobile 台灣', 'facebook:KDAN Mobile 日本', 'instagram:@kdanmobile_tw']);
    expect(JSON.stringify(accounts)).not.toContain('credentials');

    const [ig] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.externalId, 'ig-tw'));
    expect(JSON.parse(decrypt(ig!.credentials, KEY, accountContext(ig!)))).toEqual({ pageAccessToken: 'page-token-tw' });
    expect(await db.select().from(metaConnectSessions)).toHaveLength(0);
  });

  it('reactivates an expired account when it is connected again', async () => {
    const { db, ws, tw } = await setup();
    const connect = async () => {
      const sessionId = await startMetaConnect(db, KEY, { workspaceId: ws.id, userId: owner.userId, pages: PAGES });
      await completeMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: owner.userId, actor: owner.email, selections: [{ pageId: 'page-tw', marketId: tw.id, instagram: false }] });
    };
    await connect();
    await db.update(connectedAccounts).set({ status: 'expired', statusDetail: 'Session has expired' });
    await connect();
    const accounts = await listAccounts(db, ws.id);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.status).toBe('active');
  });

  it('refuses a session that belongs to someone else or has expired', async () => {
    const { db, ws, tw } = await setup();
    const sessionId = await startMetaConnect(db, KEY, { workspaceId: ws.id, userId: owner.userId, pages: PAGES, now: new Date('2026-10-20T00:00:00Z') });
    expect(await pendingMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: stranger })).toBeNull();
    expect(await pendingMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: owner.userId, now: new Date('2026-10-20T00:16:00Z') })).toBeNull();
    await expect(completeMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: stranger, actor: 'x', selections: [{ pageId: 'page-tw', marketId: tw.id, instagram: false }] })).rejects.toThrow(AccessError);
  });

  it('refuses a market from another workspace', async () => {
    const { db, ws } = await setup();
    const other = await bootstrapWorkspace(db, { name: 'Other', owner: { userId: stranger, email: 'x@example.com' }, markets: MARKETS });
    const foreignMarket = (await listMarkets(db, other.id))[0]!;
    const sessionId = await startMetaConnect(db, KEY, { workspaceId: ws.id, userId: owner.userId, pages: PAGES });
    await expect(completeMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: owner.userId, actor: owner.email, selections: [{ pageId: 'page-tw', marketId: foreignMarket.id, instagram: false }] })).rejects.toThrow(/Unknown market/);
    expect(await listAccounts(db, ws.id)).toHaveLength(0);
  });
});

describe('membership and test posts', () => {
  it('finds the workspace for a member and nothing for a stranger', async () => {
    const { db, ws } = await setup();
    expect((await membershipFor(db, owner.userId))?.workspace.id).toBe(ws.id);
    expect(await membershipFor(db, stranger)).toBeNull();
  });

  it('queues a test that the dispatcher records as a dry run', async () => {
    const { db, ws, tw } = await setup();
    const sessionId = await startMetaConnect(db, KEY, { workspaceId: ws.id, userId: owner.userId, pages: PAGES });
    await completeMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: owner.userId, actor: owner.email, selections: [{ pageId: 'page-tw', marketId: tw.id, instagram: false }] });
    const [account] = await listAccounts(db, ws.id);
    const now = new Date('2026-10-20T08:00:00Z');
    await queueDryRunTest(db, { workspaceId: ws.id, accountId: account!.id, globalEnabled: true, actor: owner.email, now });

    const f = fakeFetch();
    const summary = await dispatchDue({ db, clients: createClients(f.fn), key: KEY, globalEnabled: true, now });
    expect(summary.dry_run).toBe(1);
    expect(f.calls).toHaveLength(0);
    expect((await recentTasks(db, ws.id))[0]).toMatchObject({ status: 'dry_run', title: '測試貼文（dry-run）' });
  });

  it('refuses a test post while publishing is on, so it cannot go out for real', async () => {
    const { db, ws, tw } = await setup();
    const sessionId = await startMetaConnect(db, KEY, { workspaceId: ws.id, userId: owner.userId, pages: PAGES });
    await completeMetaConnect(db, KEY, { sessionId, workspaceId: ws.id, userId: owner.userId, actor: owner.email, selections: [{ pageId: 'page-tw', marketId: tw.id, instagram: false }] });
    await db.execute(sql`update workspaces set publishing_enabled = true`);
    const [account] = await listAccounts(db, ws.id);
    await expect(queueDryRunTest(db, { workspaceId: ws.id, accountId: account!.id, globalEnabled: true, actor: owner.email })).rejects.toThrow(/would go out for real/);
    expect(await db.select().from(publishTasks)).toHaveLength(0);
  });

  it('refuses a test post for an account in another workspace', async () => {
    const { db, ws } = await setup();
    await expect(queueDryRunTest(db, { workspaceId: ws.id, accountId: '00000000-0000-4000-8000-0000000000ff', globalEnabled: false, actor: 'x' })).rejects.toThrow(AccessError);
    expect((await db.select().from(auditLog)).map((r) => r.action)).toEqual(['workspace.created']);
  });
});
