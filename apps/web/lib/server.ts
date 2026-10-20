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
 * Whether a request comes from Vercel Cron.
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
