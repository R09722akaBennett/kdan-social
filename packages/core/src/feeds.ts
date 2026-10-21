import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { XMLParser } from 'fast-xml-parser';
import { feedItems, feeds, type Db } from './db/index';

export class FeedError extends Error {}

const FEEDS_MAX = 50;
const ITEMS_KEPT = 100;
const BYTES_MAX = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const REDIRECTS_MAX = 3;

export type Resolve = (host: string) => Promise<string[]>;
export type FeedFetch = { fetch: typeof fetch; resolve?: Resolve };

const realResolve: Resolve = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Whether an address is one the internet can reach, not loopback, private, link-local or the like. */
export function isPublicAddress(ip: string): boolean {
  const v4 = isIP(ip) === 4 ? ip : /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (v4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)));
  }
  const v6 = ip.toLowerCase();
  return !(v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff'));
}

/**
 * GET a feed address the way a stranger's URL must be read from our servers: http(s) on
 * the default ports only, every resolved address public, redirects followed by hand and
 * checked again, a 10-second timeout and a 2 MB cap.
 *
 * The check resolves the name before the request does, so a DNS answer that changes in
 * between could still reach a private address; Vercel's functions have no private
 * network of ours behind them, which keeps that gap small.
 *
 * Raises:
 *   FeedError: the address is refused, unreachable, too large or answers with an error.
 */
async function safeGet(ctx: FeedFetch, address: string): Promise<{ url: string; type: string; body: string }> {
  let url = address;
  for (let hop = 0; hop <= REDIRECTS_MAX; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new FeedError('網址格式不正確。');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new FeedError('只接受 http 或 https 的網址。');
    if (parsed.username || parsed.password || parsed.port) throw new FeedError('網址不能帶帳號密碼或指定連接埠。');
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : await (ctx.resolve ?? realResolve)(host).catch(() => []);
    if (addresses.length === 0) throw new FeedError('找不到這個網站，請確認網址。');
    if (!addresses.every(isPublicAddress)) throw new FeedError('不能讀取內部網路或本機的網址。');
    const res = await ctx.fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8' } })
      .catch((e: unknown) => { throw new FeedError(`連不上這個網站：${e instanceof Error ? e.message : String(e)}`); });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, parsed).toString();
      continue;
    }
    if (!res.ok) throw new FeedError(`網站回應 ${res.status}，沒有讀到內容。`);
    if (Number(res.headers.get('content-length') ?? 0) > BYTES_MAX) throw new FeedError('內容太大，超過 2 MB。');
    return { url: parsed.toString(), type: res.headers.get('content-type') ?? '', body: await readCapped(res) };
  }
  throw new FeedError('網址轉址太多次。');
}

// Read in chunks and stop at the cap, since a server may send no length, or a false one.
async function readCapped(res: Response) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BYTES_MAX) {
      await reader.cancel();
      throw new FeedError('內容太大，超過 2 MB。');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export type ParsedFeed = { title: string; siteUrl: string | null; items: Array<{ key: string; title: string; link: string | null; summary: string; imageUrl: string | null; publishedAt: Date | null }> };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', cdataPropName: false, processEntities: true });
const list = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : v && typeof v === 'object' && '#text' in v ? String((v as Record<string, unknown>)['#text']) : '');
// Summaries arrive as HTML; the page shows them as plain text.
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
const when = (v: unknown) => {
  const d = new Date(text(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const httpOnly = (v: string | null | undefined) => (v && /^https?:\/\//i.test(v) ? v : null);

/** Read RSS 2.0 or Atom; null when the text is neither. */
export function parseFeed(xml: string): ParsedFeed | null {
  let doc: Record<string, any>;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  const channel = doc.rss?.channel ?? doc['rdf:RDF']?.channel;
  if (channel) {
    const items = list(doc.rss?.channel?.item ?? doc['rdf:RDF']?.item);
    return {
      title: text(channel.title) || '（沒有名稱）',
      siteUrl: httpOnly(text(list(channel.link)[0])),
      items: items.map((it: Record<string, any>) => {
        const link = httpOnly(text(it.link));
        return {
          key: text(it.guid) || link || text(it.title),
          title: plain(text(it.title)) || '（沒有標題）',
          link,
          summary: plain(text(it.description) || text(it['content:encoded'])),
          imageUrl: httpOnly(it.enclosure?.['@type']?.startsWith('image') ? it.enclosure['@url'] : list(it['media:content'])[0]?.['@url'] ?? list(it['media:thumbnail'])[0]?.['@url']),
          publishedAt: when(it.pubDate ?? it['dc:date']),
        };
      }).filter((i) => i.key),
    };
  }
  if (doc.feed) {
    const f = doc.feed;
    const href = (links: unknown) => {
      const all = list(links as Record<string, string> | Array<Record<string, string>>);
      return httpOnly((all.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? all[0])?.['@href']);
    };
    return {
      title: text(f.title) || '（沒有名稱）',
      siteUrl: href(f.link),
      items: list(f.entry).map((e: Record<string, any>) => {
        const link = href(e.link);
        return { key: text(e.id) || link || text(e.title), title: plain(text(e.title)) || '（沒有標題）', link, summary: plain(text(e.summary) || text(e.content)), imageUrl: httpOnly(list(e['media:thumbnail'])[0]?.['@url']), publishedAt: when(e.published ?? e.updated) };
      }).filter((i) => i.key),
    };
  }
  return null;
}

/** A page's own RSS or Atom link, as sites list it in their head. */
function feedLinkIn(html: string, base: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) return new URL(href, base).toString();
  }
  return null;
}

/** Read an address as a feed, following a web page's feed link once. */
async function readFeed(ctx: FeedFetch, address: string) {
  const first = await safeGet(ctx, address.trim());
  const parsed = parseFeed(first.body);
  if (parsed) return { url: first.url, feed: parsed };
  const link = /html/i.test(first.type) || /<html/i.test(first.body) ? feedLinkIn(first.body, first.url) : null;
  if (!link) throw new FeedError('這個網址不是 RSS 或 Atom，頁面上也找不到訂閱連結。');
  const second = await safeGet(ctx, link);
  const feed = parseFeed(second.body);
  if (!feed) throw new FeedError('找到的訂閱連結讀不出內容。');
  return { url: second.url, feed };
}

async function saveItems(db: Db, feedId: string, items: ParsedFeed['items'], now: Date) {
  for (const i of items.slice(0, ITEMS_KEPT)) {
    const values = { title: i.title.slice(0, 300), link: i.link, summary: i.summary, imageUrl: i.imageUrl, publishedAt: i.publishedAt, fetchedAt: now };
    await db.insert(feedItems).values({ feedId, key: i.key.slice(0, 500), ...values }).onConflictDoUpdate({ target: [feedItems.feedId, feedItems.key], set: values });
  }
}

/**
 * Follow a feed: read it once now and keep its entries.
 *
 * Raises:
 *   FeedError: the workspace follows 50 already, follows this one already, or the address
 *     cannot be read as a feed (see `safeGet`).
 */
export async function addFeed(db: Db, ctx: FeedFetch, a: { workspaceId: string; actor: string; url: string; now?: Date }) {
  const now = a.now ?? new Date();
  const existing = await db.select({ url: feeds.url }).from(feeds).where(eq(feeds.workspaceId, a.workspaceId));
  if (existing.length >= FEEDS_MAX) throw new FeedError(`最多訂閱 ${FEEDS_MAX} 個來源。`);
  const { url, feed } = await readFeed(ctx, a.url);
  if (existing.some((f) => f.url === url)) throw new FeedError('已經訂閱這個來源了。');
  const [row] = await db.insert(feeds).values({ workspaceId: a.workspaceId, url, title: feed.title.slice(0, 200), siteUrl: feed.siteUrl, createdBy: a.actor, lastFetchedAt: now }).returning();
  await saveItems(db, row!.id, feed.items, now);
  return row!;
}

export type FeedRefresh = { feeds: number; failed: number };

/** Read every followed feed again; a feed that fails keeps its entries and records why. */
export async function refreshFeeds(db: Db, ctx: FeedFetch, a: { workspaceId?: string; now?: Date; log?: (line: string) => void } = {}): Promise<FeedRefresh> {
  const now = a.now ?? new Date();
  const rows = await db.select().from(feeds).where(a.workspaceId ? eq(feeds.workspaceId, a.workspaceId) : undefined);
  const summary: FeedRefresh = { feeds: 0, failed: 0 };
  for (const f of rows) {
    try {
      const { feed } = await readFeed(ctx, f.url);
      await saveItems(db, f.id, feed.items, now);
      await db.update(feeds).set({ lastFetchedAt: now, lastError: null }).where(eq(feeds.id, f.id));
      summary.feeds++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      a.log?.(`Feed refresh failed for ${f.url}: ${message}`);
      await db.update(feeds).set({ lastError: message }).where(eq(feeds.id, f.id));
      summary.failed++;
    }
  }
  return summary;
}

/** The workspace's feeds, by name. */
export function listFeeds(db: Db, workspaceId: string) {
  return db.select().from(feeds).where(eq(feeds.workspaceId, workspaceId)).orderBy(feeds.title);
}

/** The newest entries across the workspace's feeds, or one feed's. */
export async function listFeedItems(db: Db, a: { workspaceId: string; feedId?: string; limit?: number }) {
  const mine = await listFeeds(db, a.workspaceId);
  const ids = mine.filter((f) => !a.feedId || f.id === a.feedId).map((f) => f.id);
  if (!ids.length) return [];
  const rows = await db.select().from(feedItems).where(inArray(feedItems.feedId, ids))
    // Entries without a date go last; Postgres puts nulls first when sorting newest first.
    .orderBy(sql`${feedItems.publishedAt} desc nulls last`, desc(feedItems.fetchedAt)).limit(a.limit ?? 60);
  return rows.map((item) => ({ ...item, feed: mine.find((f) => f.id === item.feedId)! }));
}

/** Stop following a feed; its entries go with it. */
export async function deleteFeed(db: Db, a: { workspaceId: string; id: string }) {
  await db.delete(feeds).where(and(eq(feeds.id, a.id), eq(feeds.workspaceId, a.workspaceId)));
}

/** One entry, with its feed, or null when it is not in the workspace's feeds. */
export async function getFeedItem(db: Db, a: { workspaceId: string; id: string }) {
  if (!/^[0-9a-f-]{36}$/.test(a.id)) return null;
  const [row] = await db.select({ item: feedItems, feed: feeds }).from(feedItems).innerJoin(feeds, eq(feeds.id, feedItems.feedId))
    .where(and(eq(feedItems.id, a.id), eq(feeds.workspaceId, a.workspaceId)));
  return row ?? null;
}
