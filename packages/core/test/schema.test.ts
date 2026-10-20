import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testDb } from './helpers';

describe('schema', () => {
  it('has row level security on every public table, so the Supabase Data API sees nothing', async () => {
    const db = await testDb();
    const res = await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect((res as { rows: unknown[] }).rows).toEqual([]);
  });
});
