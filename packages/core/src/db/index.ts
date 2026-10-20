import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

export * from './schema';
export { schema };

/** Any Drizzle Postgres database over this schema: node-postgres in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Connect to the database at `url` (usually `DATABASE_URL`). */
export function createDb(url: string): Db {
  return drizzle(new pg.Pool({ connectionString: url, max: 5 }), { schema });
}
