import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, decrypt } from '../src/crypto';
import { auditLog, connectedAccounts } from '../src/db/index';
import { createClients } from '../src/index';
import { lineClient } from '../src/platforms/line';
import { createPost } from '../src/posts';
import { dispatchDue } from '../src/publish/dispatch';
import { bootstrapWorkspace, ConnectError, connectLine, lineUsage, listAccounts, listMarkets } from '../src/workspace';
import { fakeFetch, KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const NOW = new Date('2026-10-20T08:00:00Z');
const SECRET = 'a'.repeat(32);
const token = [/oauth2\/v3\/token$/, { body: { access_token: 'stateless' } }] as const;
const bot = [/v2\/bot\/info$/, { body: { userId: 'Uabc', basicId: '@kdan', displayName: 'KDAN 官方帳號' } }] as const;

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN Mobile', owner, markets: [{ code: 'TW', name: '台灣', locale: 'zh-Hant-TW', timeZone: 'Asia/Taipei' }] });
  const [tw] = await listMarkets(db, ws.id);
  return { db, ws, tw: tw! };
}

describe('connectLine', () => {
  it('checks the credentials with LINE, names the account from LINE and stores the secret encrypted', async () => {
    const { db, ws, tw } = await setup();
    const f = fakeFetch().on('POST', ...token).on('GET', ...bot);
    const { name } = await connectLine(db, KEY, lineClient(f.fn), { workspaceId: ws.id, marketId: tw.id, channelId: ' 2001234567 ', channelSecret: SECRET + ' ', actor: owner.email });
    expect(name).toBe('KDAN 官方帳號（@kdan）');
    const [a] = await db.select().from(connectedAccounts);
    expect(a!.credentials).not.toContain(SECRET);
    expect(JSON.parse(decrypt(a!.credentials, KEY, accountContext(a!)))).toEqual({ channelId: '2001234567', channelSecret: SECRET });
    expect((await db.select().from(auditLog)).map((r) => r.action)).toContain('account.connected');
  });

  it('saves nothing when LINE rejects the credentials', async () => {
    const { db, ws, tw } = await setup();
    const f = fakeFetch().on('POST', /oauth2\/v3\/token$/, { status: 400, body: { error: 'invalid_request', error_description: "Invalid 'client_credentials'." } });
    await expect(connectLine(db, KEY, lineClient(f.fn), { workspaceId: ws.id, marketId: tw.id, channelId: '2001234567', channelSecret: SECRET, actor: 'x' })).rejects.toThrow(/對不上/);
    expect(await listAccounts(db, ws.id)).toHaveLength(0);
  });

  it('rejects a malformed channel ID or secret before calling LINE', async () => {
    const { db, ws, tw } = await setup();
    const f = fakeFetch();
    const args = { workspaceId: ws.id, marketId: tw.id, actor: 'x' };
    await expect(connectLine(db, KEY, lineClient(f.fn), { ...args, channelId: 'abc', channelSecret: SECRET })).rejects.toThrow(ConnectError);
    // A long-lived channel access token pasted by mistake is ~170 characters.
    await expect(connectLine(db, KEY, lineClient(f.fn), { ...args, channelId: '2001234567', channelSecret: 'x'.repeat(172) })).rejects.toThrow(/172 個字元.*Channel access token/);
    expect(f.calls).toHaveLength(0);
  });

  it('tells a wrong channel ID apart from a wrong secret', async () => {
    const { db, ws, tw } = await setup();
    const f = fakeFetch().on('POST', /oauth2\/v3\/token$/, { status: 400, body: { error: 'invalid_request', error_description: "invalid 'client_id'." } });
    await expect(connectLine(db, KEY, lineClient(f.fn), { workspaceId: ws.id, marketId: tw.id, channelId: '1', channelSecret: SECRET, actor: 'x' })).rejects.toThrow(/找不到這個 Channel ID/);
  });

  it('reactivates an expired LINE account when connected again', async () => {
    const { db, ws, tw } = await setup();
    const f = fakeFetch().on('POST', ...token).on('GET', ...bot);
    const args = { workspaceId: ws.id, marketId: tw.id, channelId: '2001234567', channelSecret: SECRET, actor: 'x' };
    await connectLine(db, KEY, lineClient(f.fn), args);
    await db.update(connectedAccounts).set({ status: 'expired' });
    await connectLine(db, KEY, lineClient(f.fn), { ...args, channelSecret: SECRET.replace('a', 'b') });
    const accounts = await listAccounts(db, ws.id);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.status).toBe('active');
  });
});

describe('lineUsage', () => {
  it('reports quota and reachable friends per account', async () => {
    const { db, ws, tw } = await setup();
    const f = fakeFetch().on('POST', ...token).on('GET', ...bot)
      .on('GET', /quota\/consumption$/, { body: { totalUsage: 3200 } })
      .on('GET', /quota$/, { body: { type: 'limited', value: 5000 } })
      .on('GET', /insight\/followers/, { body: { status: 'ready', followers: 5430, targetedReaches: 5100, blocks: 330 } });
    await connectLine(db, KEY, lineClient(f.fn), { workspaceId: ws.id, marketId: tw.id, channelId: '2001234567', channelSecret: SECRET, actor: 'x' });
    const [u] = await lineUsage(db, KEY, lineClient(f.fn), { workspaceId: ws.id, now: NOW });
    expect(u).toMatchObject({ quota: { limit: 5000, used: 3200 }, audience: { followers: 5430, targetedReaches: 5100 }, error: null });
  });

  it('marks the account expired when the secret stopped working', async () => {
    const { db, ws, tw } = await setup();
    const ok = fakeFetch().on('POST', ...token).on('GET', ...bot);
    await connectLine(db, KEY, lineClient(ok.fn), { workspaceId: ws.id, marketId: tw.id, channelId: '2001234567', channelSecret: SECRET, actor: 'x' });
    const bad = fakeFetch().on('POST', /oauth2\/v3\/token$/, { status: 400, body: { error: 'invalid_client' } });
    const [u] = await lineUsage(db, KEY, lineClient(bad.fn), { workspaceId: ws.id, now: NOW });
    expect(u!.error).toMatch(/授權失效/);
    expect((await listAccounts(db, ws.id))[0]!.status).toBe('expired');
  });
});

describe('LINE posts', () => {
  async function connected() {
    const s = await setup();
    const f = fakeFetch().on('POST', ...token).on('GET', ...bot);
    await connectLine(s.db, KEY, lineClient(f.fn), { workspaceId: s.ws.id, marketId: s.tw.id, channelId: '2001234567', channelSecret: SECRET, actor: 'x' });
    const [a] = await listAccounts(s.db, s.ws.id);
    return { ...s, accountId: a!.id };
  }
  const img = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://cdn/x${i}.jpg`, previewUrl: `https://cdn/x${i}-p.jpg` }));

  it('enforces LINE’s text and image limits', async () => {
    const { db, ws, accountId } = await connected();
    const base = { workspaceId: ws.id, actor: 'x', role: 'owner' as const, accountIds: [accountId], schedule: { mode: 'now' as const }, now: NOW };
    await expect(createPost(db, { ...base, body: 'x'.repeat(5001), media: [] })).rejects.toThrow(/最多 5000 字/);
    await expect(createPost(db, { ...base, body: 'hi', media: img(5) })).rejects.toThrow(/最多 4 張/);
    await expect(createPost(db, { ...base, body: ' ', media: [] })).rejects.toThrow(/要有文字或圖片/);
    await expect(createPost(db, { ...base, body: 'hi', media: [{ url: 'https://cdn/a.jpg', previewUrl: 'http://cdn/a.jpg' }] })).rejects.toThrow(/https/);
  });

  it('broadcasts the LINE version with the small preview image', async () => {
    const { db, ws, accountId } = await connected();
    await createPost(db, { workspaceId: ws.id, actor: 'x', role: 'owner', body: '共用', overrides: { line: 'LINE 版' }, accountIds: [accountId], media: img(1), schedule: { mode: 'now' }, now: NOW });
    await db.execute(sql`update workspaces set publishing_enabled = true`);
    const f = fakeFetch().on('POST', ...token).on('POST', /broadcast$/, { body: {}, headers: { 'x-line-request-id': 'req-9' } });
    expect((await dispatchDue({ db, clients: createClients(f.fn), key: KEY, globalEnabled: true, now: NOW })).published).toBe(1);
    const sent = JSON.parse(f.calls.find((c) => c.url.endsWith('/broadcast'))!.body);
    expect(sent.messages).toEqual([
      { type: 'text', text: 'LINE 版' },
      { type: 'image', originalContentUrl: 'https://cdn/x0.jpg', previewImageUrl: 'https://cdn/x0-p.jpg' },
    ]);
  });

  it('fails at once instead of retrying when the monthly quota is spent', async () => {
    const { db, ws, accountId } = await connected();
    await createPost(db, { workspaceId: ws.id, actor: 'x', role: 'owner', body: 'hi', accountIds: [accountId], media: [], schedule: { mode: 'now' }, now: NOW });
    await db.execute(sql`update workspaces set publishing_enabled = true`);
    const f = fakeFetch().on('POST', ...token).on('POST', /broadcast$/, { status: 429, body: { message: 'You have reached your monthly limit.' } });
    expect((await dispatchDue({ db, clients: createClients(f.fn), key: KEY, globalEnabled: true, now: NOW })).failed).toBe(1);
    const [a] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, accountId));
    expect(a!.status).toBe('active');
  });
});
