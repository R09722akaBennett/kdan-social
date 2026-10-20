import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { accountContext, encrypt, generateKey } from '../src/crypto';
import * as schema from '../src/db/schema';
import type { Db } from '../src/db/index';

export const KEY = Buffer.from(generateKey(), 'base64');

export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  return db as unknown as Db;
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error;
type Route = { method: string; match: RegExp; replies: Reply[] };
export type Call = { method: string; url: string; body: string; headers: Record<string, string> };

/**
 * A fetch that answers from scripted routes and records every call.
 * Each route replays its replies in order and repeats the last one.
 */
export function fakeFetch() {
  const routes: Route[] = [];
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    calls.push({ method, url, body: init.body ? String(init.body) : '', headers });
    const route = routes.find((r) => r.method === method && r.match.test(url));
    if (!route) return new Response(JSON.stringify({ error: { message: `no route for ${method} ${url}` } }), { status: 404 });
    const reply = route.replies.length > 1 ? route.replies.shift()! : route.replies[0]!;
    if (reply instanceof Error) throw reply;
    return new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: reply.headers });
  }) as typeof fetch;
  return {
    fn,
    calls,
    on(method: string, match: RegExp, ...replies: Reply[]) {
      routes.push({ method, match, replies });
      return this;
    },
  };
}

/** One workspace with a Taiwan market, a Facebook page, and a post scheduled for it. */
export async function seed(db: Db, opts: { publishing?: boolean; review?: 'approved' | 'pending'; accountStatus?: 'active' | 'expired'; runAt?: Date; media?: { url: string; alt?: string }[] } = {}) {
  const [ws] = await db.insert(schema.workspaces).values({ name: 'KDAN Mobile', publishingEnabled: opts.publishing ?? false }).returning();
  const [market] = await db.insert(schema.markets).values({ workspaceId: ws!.id, code: 'TW', name: '台灣', locale: 'zh-Hant-TW', timeZone: 'Asia/Taipei' }).returning();
  const ref = { workspaceId: ws!.id, platform: 'facebook' as const, externalId: 'page-1' };
  const [account] = await db.insert(schema.connectedAccounts).values({
    ...ref,
    marketId: market!.id,
    name: 'KDAN Mobile 台灣',
    credentials: encrypt(JSON.stringify({ pageAccessToken: 'secret-page-token' }), KEY, accountContext(ref)),
    status: opts.accountStatus ?? 'active',
  }).returning();
  const [post] = await db.insert(schema.posts).values({ workspaceId: ws!.id, title: '雙十一預告' }).returning();
  const [variant] = await db.insert(schema.postVariants).values({
    postId: post!.id, marketId: market!.id, platform: 'facebook', body: 'PDF Reader 全方案 5 折', media: opts.media ?? [], reviewStatus: opts.review ?? 'approved',
  }).returning();
  const [task] = await db.insert(schema.publishTasks).values({ variantId: variant!.id, accountId: account!.id, runAt: opts.runAt ?? new Date('2026-10-20T12:00:00Z') }).returning();
  return { ws: ws!, market: market!, account: account!, post: post!, variant: variant!, task: task! };
}
