import { describe, expect, it } from 'vitest';
import { addFeed, deleteFeed, FeedError, getFeedItem, isPublicAddress, listFeedItems, listFeeds, parseFeed, refreshFeeds } from '../src/feeds';
import { bootstrapWorkspace } from '../src/workspace';
import { testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const NOW = new Date('2026-10-21T08:00:00Z');

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>KDAN 部落格</title><link>https://blog.example.com/</link>
<item><title>PDF 小技巧 &amp; 捷徑</title><link>https://blog.example.com/a</link><guid>a-1</guid><pubDate>Mon, 20 Oct 2026 02:00:00 GMT</pubDate>
<description><![CDATA[<p>三個 <b>快速</b> 技巧</p>]]></description><enclosure url="https://blog.example.com/a.jpg" type="image/jpeg"/></item>
<item><title>第二篇</title><link>https://blog.example.com/b</link></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom 站</title><link href="https://atom.example.com/"/>
<entry><id>urn:1</id><title>一則</title><link rel="alternate" href="https://atom.example.com/1"/><summary>摘要</summary><updated>2026-10-19T00:00:00Z</updated></entry></feed>`;

type Reply = { status?: number; body?: string; type?: string; location?: string };
/** A fetch answering by URL, with raw bodies, recording what was asked. */
function fakeWeb(routes: Record<string, Reply>) {
  const asked: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const r = routes[url];
    if (!r) return new Response('missing', { status: 404 });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'application/rss+xml', ...(r.location ? { location: r.location } : {}) } });
  }) as typeof fetch;
  return { fn, asked };
}
const publicDns = async () => ['93.184.216.34'];

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  return { db, ws, who: { workspaceId: ws.id, actor: owner.email, now: NOW } };
}

describe('isPublicAddress', () => {
  it('refuses loopback, private, link-local, CGNAT and their IPv6 forms', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '172.32.0.1']) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe('parseFeed', () => {
  it('reads RSS items with decoded titles, plain summaries and images, and Atom entries', () => {
    const rss = parseFeed(RSS)!;
    expect(rss.title).toBe('KDAN 部落格');
    expect(rss.items[0]).toMatchObject({ key: 'a-1', title: 'PDF 小技巧 & 捷徑', summary: '三個 快速 技巧', imageUrl: 'https://blog.example.com/a.jpg', link: 'https://blog.example.com/a' });
    expect(rss.items[1]!.key).toBe('https://blog.example.com/b');
    expect(parseFeed(ATOM)!.items).toMatchObject([{ key: 'urn:1', link: 'https://atom.example.com/1', summary: '摘要' }]);
    expect(parseFeed('<html><body>hi</body></html>')).toBeNull();
  });
});

describe('addFeed', () => {
  it('follows a feed, keeps its entries, and refuses following it twice', async () => {
    const { db, ws, who } = await setup();
    const web = fakeWeb({ 'https://blog.example.com/feed': { body: RSS } });
    const f = await addFeed(db, { fetch: web.fn, resolve: publicDns }, { ...who, url: ' https://blog.example.com/feed ' });
    expect(f).toMatchObject({ title: 'KDAN 部落格', siteUrl: 'https://blog.example.com/' });
    expect((await listFeedItems(db, { workspaceId: ws.id })).map((i) => i.title)).toEqual(['PDF 小技巧 & 捷徑', '第二篇']);
    const [first] = await listFeedItems(db, { workspaceId: ws.id });
    expect((await getFeedItem(db, { workspaceId: ws.id, id: first!.id }))?.feed.title).toBe('KDAN 部落格');
    const other = await bootstrapWorkspace(db, { name: 'B', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } });
    expect(await getFeedItem(db, { workspaceId: other.id, id: first!.id })).toBeNull();
    await expect(addFeed(db, { fetch: web.fn, resolve: publicDns }, { ...who, url: 'https://blog.example.com/feed' })).rejects.toThrow(/已經訂閱/);
  });

  it('finds a page’s own feed link', async () => {
    const { db, who } = await setup();
    const web = fakeWeb({
      'https://site.example.com/': { type: 'text/html', body: '<html><head><link rel="alternate" type="application/atom+xml" href="/atom.xml"></head></html>' },
      'https://site.example.com/atom.xml': { body: ATOM, type: 'application/atom+xml' },
    });
    expect((await addFeed(db, { fetch: web.fn, resolve: publicDns }, { ...who, url: 'https://site.example.com/' })).url).toBe('https://site.example.com/atom.xml');
  });

  it('never asks for internal addresses, directly, by name or through a redirect', async () => {
    const { db, who } = await setup();
    const web = fakeWeb({ 'https://evil.example.com/': { status: 302, location: 'http://169.254.169.254/latest/meta-data' } });
    const ctx = { fetch: web.fn, resolve: publicDns };
    await expect(addFeed(db, ctx, { ...who, url: 'http://127.0.0.1/feed' })).rejects.toThrow(/內部網路/);
    await expect(addFeed(db, { fetch: web.fn, resolve: async () => ['10.0.0.5'] }, { ...who, url: 'https://intranet.example.com/' })).rejects.toThrow(/內部網路/);
    await expect(addFeed(db, ctx, { ...who, url: 'https://evil.example.com/' })).rejects.toThrow(/內部網路/);
    await expect(addFeed(db, ctx, { ...who, url: 'file:///etc/passwd' })).rejects.toThrow(/http/);
    await expect(addFeed(db, ctx, { ...who, url: 'https://blog.example.com:8443/feed' })).rejects.toThrow(/連接埠/);
    expect(web.asked).toEqual(['https://evil.example.com/']);
  });

  it('refuses a body over 2 MB and a page with no feed', async () => {
    const { db, who } = await setup();
    const web = fakeWeb({ 'https://big.example.com/': { body: 'x'.repeat(2 * 1024 * 1024 + 1) }, 'https://plain.example.com/': { type: 'text/html', body: '<html><p>no feed</p></html>' } });
    await expect(addFeed(db, { fetch: web.fn, resolve: publicDns }, { ...who, url: 'https://big.example.com/' })).rejects.toThrow(/2 MB/);
    await expect(addFeed(db, { fetch: web.fn, resolve: publicDns }, { ...who, url: 'https://plain.example.com/' })).rejects.toThrow(FeedError);
  });
});

describe('refreshFeeds', () => {
  it('keeps entries and records the reason when a feed stops answering, then clears it', async () => {
    const { db, ws, who } = await setup();
    const routes: Record<string, Reply> = { 'https://blog.example.com/feed': { body: RSS } };
    const web = fakeWeb(routes);
    const feed = await addFeed(db, { fetch: web.fn, resolve: publicDns }, { ...who, url: 'https://blog.example.com/feed' });
    routes['https://blog.example.com/feed'] = { status: 503 };
    expect(await refreshFeeds(db, { fetch: web.fn, resolve: publicDns }, { workspaceId: ws.id })).toEqual({ feeds: 0, failed: 1 });
    expect((await listFeeds(db, ws.id))[0]!.lastError).toMatch(/503/);
    expect(await listFeedItems(db, { workspaceId: ws.id })).toHaveLength(2);
    routes['https://blog.example.com/feed'] = { body: RSS };
    await refreshFeeds(db, { fetch: web.fn, resolve: publicDns }, { workspaceId: ws.id });
    expect((await listFeeds(db, ws.id))[0]!.lastError).toBeNull();
    await deleteFeed(db, { workspaceId: ws.id, id: feed.id });
    expect(await listFeedItems(db, { workspaceId: ws.id })).toEqual([]);
  });
});
