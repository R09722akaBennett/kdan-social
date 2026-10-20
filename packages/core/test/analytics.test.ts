import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { accountPosts, connectedAccounts, followerSnapshots, postMetrics, publishTasks } from '../src/db/index';
import { followerSeries, performanceRows, postPerformance } from '../src/analytics';
import { createClients } from '../src/index';
import { facebookClient, instagramClient } from '../src/platforms/meta';
import { lineClient } from '../src/platforms/line';
import { createPost } from '../src/posts';
import { collectPostMetrics, importAccountPosts } from '../src/snapshot';
import { saveGroup } from '../src/groups';
import { bootstrapWorkspace } from '../src/workspace';
import { fakeFetch, KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const NOW = new Date('2026-10-20T08:00:00Z');
const page = { externalId: 'page-1', credentials: { pageAccessToken: 't' } };

describe('post metrics clients', () => {
  it('reads Facebook reactions, comments and shares, counting a missing shares field as none', async () => {
    const f = fakeFetch().on('GET', /graph\.facebook\.com\/.*\/1_2\?/, { body: { reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } } } });
    expect(await facebookClient(f.fn).metrics(page, '1_2')).toEqual({ engagements: 15, detail: { reactions: 12, comments: 3, shares: 0 } });
    expect(decodeURIComponent(f.calls[0]!.url)).toContain('fields=reactions.summary(total_count)');
  });

  it('reads Instagram likes and comments', async () => {
    const f = fakeFetch().on('GET', /\/178\?/, { body: { like_count: 40, comments_count: 2 } });
    expect(await instagramClient(f.fn).metrics(page, '178')).toEqual({ engagements: 42, detail: { likes: 40, comments: 2 } });
  });

  it('reads LINE opens and clicks, keeps LINE’s nulls, and skips ids that are not request ids', async () => {
    const id = '96b78fb9-0000-4000-8000-000000000001';
    const f = fakeFetch().on('POST', /oauth2\/v3\/token$/, { body: { access_token: 'x' } })
      .on('GET', /insight\/message\/event/, { body: { overview: { delivered: 5400, uniqueImpression: 1200, uniqueClick: null } } });
    const line = lineClient(f.fn);
    const acc = { externalId: '200', credentials: { channelId: '200', channelSecret: 'a'.repeat(32) } };
    expect(await line.metrics(acc, id)).toEqual({ engagements: null, opens: 1200, detail: { delivered: 5400, opens: 1200, clicks: null } });
    expect(await line.metrics(acc, 'retry-key-abc')).toEqual({ engagements: null, opens: null, detail: {} });
    expect(f.calls.filter((c) => c.url.includes('insight'))).toHaveLength(1);
  });
});

describe('collecting and reading performance', () => {
  async function setup() {
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
    const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId: 'page-1' };
    const [acc] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: 'KDAN TW', credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)) }).returning();
    const tw = await saveGroup(db, { workspaceId: ws.id, name: '台灣', accountIds: [acc!.id], actor: 'x', role: 'owner' });
    const { postId } = await createPost(db, { workspaceId: ws.id, actor: 'x', role: 'owner', body: '雙十一', accountIds: [acc!.id], media: [], schedule: { mode: 'now' }, now: NOW });
    await db.update(publishTasks).set({ status: 'published', finishedAt: NOW, externalPostId: '1_2' });
    return { db, ws, accountId: acc!.id, tw, postId };
  }

  it('saves each recent post’s numbers and returns them with the post', async () => {
    const { db, ws, tw, postId } = await setup();
    const f = fakeFetch().on('GET', /\/1_2\?/, { body: { reactions: { summary: { total_count: 8 } }, comments: { summary: { total_count: 1 } }, shares: { count: 1 } } });
    expect(await collectPostMetrics({ db, clients: createClients(f.fn), key: KEY, now: NOW })).toEqual({ saved: 1, failed: 0 });
    const rows = await postPerformance(db, { workspaceId: ws.id, from: new Date('2026-10-01T00:00:00Z'), groupIds: [tw] });
    expect(rows.map((r) => [r.postId, r.title, r.groupName, r.engagements])).toEqual([[postId, '雙十一', '台灣', 10]]);
    expect(await postPerformance(db, { workspaceId: ws.id, from: new Date('2026-10-01T00:00:00Z'), groupIds: [null] })).toEqual([]);
  });

  it('leaves posts older than 30 days alone and logs a failure without stopping', async () => {
    const { db } = await setup();
    const f = fakeFetch().on('GET', /\/1_2\?/, { status: 500, body: { error: { message: 'boom' } } });
    const lines: string[] = [];
    const s = await collectPostMetrics({ db, clients: createClients(f.fn), key: KEY, now: NOW, log: (l) => lines.push(l) });
    expect(s.failed).toBe(1);
    expect(lines[0]).toMatch(/Post metrics failed/);
    expect(await collectPostMetrics({ db, clients: createClients(f.fn), key: KEY, now: new Date('2026-12-01T00:00:00Z') })).toEqual({ saved: 0, failed: 0 });
    expect(await db.select().from(postMetrics)).toHaveLength(0);
  });

  it('returns follower series within the window, oldest first', async () => {
    const { db, ws, accountId } = await setup();
    await db.insert(followerSnapshots).values([
      { accountId, day: '2026-09-01', followers: 900 },
      { accountId, day: '2026-10-19', followers: 1010 },
      { accountId, day: '2026-10-14', followers: 1000 },
    ]);
    const s = await followerSeries(db, { workspaceId: ws.id, days: 7, now: NOW });
    expect(s.get(accountId)).toEqual([{ day: '2026-10-14', followers: 1000 }, { day: '2026-10-19', followers: 1010 }]);
  });
});

describe('importing an account’s own posts', () => {
  const day = (iso: string) => new Date(`${iso}T03:00:00Z`).toISOString();

  it('lists Facebook posts since a date and stops paging at the first older one', async () => {
    const f = fakeFetch()
      .on('GET', /page-1\/published_posts\?/, { body: { data: [
        { id: '1_10', message: '雙十一\n第二行', created_time: day('2026-10-19'), permalink_url: 'https://fb/1_10', status_type: 'added_photos', reactions: { summary: { total_count: 5 } }, comments: { summary: { total_count: 1 } } },
      ], paging: { next: 'https://graph.facebook.com/v25.0/next-page' } } })
      .on('GET', /next-page/, { body: { data: [
        { id: '1_9', message: 'old enough', created_time: day('2026-09-01'), reactions: { summary: { total_count: 2 } }, comments: { summary: { total_count: 0 } } },
        { id: '1_8', message: 'too old', created_time: day('2026-07-01') },
      ], paging: { next: 'https://graph.facebook.com/v25.0/never' } } });
    const posts = await facebookClient(f.fn).recentPosts!(page, new Date('2026-08-21T00:00:00Z'));
    expect(posts.map((p) => [p.externalId, p.metrics.engagements, p.permalink])).toEqual([['1_10', 6, 'https://fb/1_10'], ['1_9', 2, null]]);
    expect(f.calls.some((c) => c.url.includes('never'))).toBe(false);
  });

  it('lists Instagram media with likes and comments', async () => {
    const f = fakeFetch().on('GET', /ig-1\/media\?/, { body: { data: [{ id: 'm1', caption: 'hi', media_type: 'IMAGE', permalink: 'https://ig/p/1', timestamp: day('2026-10-18'), like_count: 9, comments_count: 1 }] } });
    const posts = await instagramClient(f.fn).recentPosts!({ externalId: 'ig-1', credentials: { pageAccessToken: 't' } }, new Date('2026-08-21T00:00:00Z'));
    expect(posts[0]).toMatchObject({ externalId: 'm1', mediaType: 'IMAGE', metrics: { engagements: 10 } });
  });

  it('stores posts once, updates their numbers, and shows only those kdan-social did not send', async () => {
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
    const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId: 'page-1' };
    const [acc] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: 'KDAN TW', credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)) }).returning();
    await createPost(db, { workspaceId: ws.id, actor: 'x', role: 'owner', body: '我們發的', accountIds: [acc!.id], media: [], schedule: { mode: 'now' }, now: NOW });
    await db.update(publishTasks).set({ status: 'published', finishedAt: NOW, externalPostId: '1_10' });
    const listing = (likes: number) => ({ body: { data: [
      { id: '1_10', message: '我們發的', created_time: day('2026-10-19'), reactions: { summary: { total_count: likes } }, comments: { summary: { total_count: 0 } } },
      { id: '1_11', message: '小編直接在粉專發的', created_time: day('2026-10-18'), permalink_url: 'https://fb/1_11', reactions: { summary: { total_count: likes } }, comments: { summary: { total_count: 0 } } },
    ] } });
    const run = (likes: number) => collect(fakeFetch().on('GET', /published_posts/, listing(likes)));
    const collect = (f: ReturnType<typeof fakeFetch>) => importAccountPosts({ db, clients: createClients(f.fn), key: KEY, now: NOW });
    expect(await run(3)).toEqual({ accounts: 1, posts: 2, failed: 0 });
    await run(7);
    expect((await db.select().from(accountPosts)).map((p) => [p.externalId, p.engagements]).sort()).toEqual([['1_10', 7], ['1_11', 7]]);
    const rows = await performanceRows(db, { workspaceId: ws.id, from: new Date('2026-10-01T00:00:00Z') });
    expect(rows.map((r) => [r.source, r.title, r.permalink])).toEqual([['kdan', '我們發的', null], ['platform', '小編直接在粉專發的', 'https://fb/1_11']]);
  });
});
