import 'server-only';
import { createClients, loadKey } from '@kdan-social/core';
import { createDb, type Db } from '@kdan-social/core/db';
import { timingSafeEqual } from 'node:crypto';

let db: Db | undefined;

/** The shared database handle; created on first use so builds need no DATABASE_URL. */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    db = createDb(url);
  }
  return db;
}

export function deps() {
  return { db: getDb(), clients: createClients(), key: loadKey() };
}

/**
 * Whether a request comes from one of our schedulers (Supabase Cron or Vercel Cron).
 *
 * Fails closed: with CRON_SECRET unset nothing is authorised, so a deployment that
 * forgot the variable cannot be triggered by anyone who guesses the path.
 */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * The public base URL, used where Meta and Supabase need an exact redirect address.
 *
 * Prefers the production domain over the request's own host: a deployment URL such as
 * `kdan-social-abc123.vercel.app` is not registered with Meta, and a redirect_uri that
 * differs by one character makes the authorization fail.
 */
export function appUrl(req?: Request): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return req ? new URL(req.url).origin : 'http://localhost:3000';
}

export function metaApp(req?: Request) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error('META_APP_ID and META_APP_SECRET must be set');
  return { appId, appSecret, redirectUri: `${appUrl(req)}/api/meta/callback` };
}

/** Codes that let someone create a workspace themselves; none means signup is invite-only. */
export function signupCodes(): string[] {
  return (process.env.SIGNUP_CODES ?? '').split(',').map((c) => c.trim()).filter(Boolean);
}
