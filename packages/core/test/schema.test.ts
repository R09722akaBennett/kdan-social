import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { testDb } from './helpers';

describe('schema', () => {
  it('has row level security on every public table, so the Supabase Data API sees nothing', async () => {
    const db = await testDb();
    const res = await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect((res as { rows: unknown[] }).rows).toEqual([]);
  });
});

describe('migration from markets to account groups', () => {
  it('turns markets into groups, moves their clock onto accounts, splits shared variants per account, and recovers post authors', async () => {
    const pg = new PGlite();
    const db = drizzle(pg);
    const folder = fileURLToPath(new URL('../drizzle', import.meta.url));
    // Bring the database to the last schema that had markets, as production was.
    const before = mkdtempSync(join(tmpdir(), 'kdan-mig-'));
    cpSync(folder, before, { recursive: true });
    const journal = JSON.parse(readFileSync(join(before, 'meta/_journal.json'), 'utf8'));
    journal.entries = journal.entries.filter((e: { tag: string }) => e.tag <= '0002');
    writeFileSync(join(before, 'meta/_journal.json'), JSON.stringify(journal));
    await migrate(db, { migrationsFolder: before });

    await pg.exec(`
      insert into workspaces (id, name) values ('00000000-0000-4000-8000-0000000000a1', 'KDAN');
      insert into markets (id, workspace_id, code, name, locale, time_zone, requires_review) values
        ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'TW', '台灣', 'zh-Hant-TW', 'Asia/Taipei', false),
        ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'JP', '日本', 'ja-JP', 'Asia/Tokyo', false);
      insert into connected_accounts (id, workspace_id, market_id, platform, external_id, name, credentials) values
        ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'facebook', 'p1', 'TW page 1', 'x'),
        ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'facebook', 'p2', 'TW page 2', 'x'),
        ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'facebook', 'p3', 'JP page', 'x');
      insert into posts (id, workspace_id, title) values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'p');
      insert into audit_log (workspace_id, actor, action, target) values ('00000000-0000-4000-8000-0000000000a1', 'editor@example.com', 'post.created', '00000000-0000-4000-8000-0000000000d1');
      insert into post_variants (id, post_id, market_id, platform, body, review_status) values
        ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', 'facebook', 'TW text', 'approved'),
        ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b2', 'facebook', 'JP text', 'pending'),
        ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b2', 'instagram', 'orphan', 'approved');
      insert into publish_tasks (id, variant_id, account_id, run_at, status) values
        ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', now(), 'published'),
        ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c2', now(), 'scheduled'),
        ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c3', now(), 'scheduled');
    `);
    await migrate(db, { migrationsFolder: folder });

    const rows = async (q: string) => (await pg.query(q)).rows;
    expect(await rows(`select name from account_groups order by name`)).toEqual([{ name: '台灣' }, { name: '日本' }]);
    expect(await rows(`select name, group_id, time_zone from connected_accounts order by name`)).toEqual([
      { name: 'JP page', group_id: '00000000-0000-4000-8000-0000000000b2', time_zone: 'Asia/Tokyo' },
      { name: 'TW page 1', group_id: '00000000-0000-4000-8000-0000000000b1', time_zone: 'Asia/Taipei' },
      { name: 'TW page 2', group_id: '00000000-0000-4000-8000-0000000000b1', time_zone: 'Asia/Taipei' },
    ]);
    expect(await rows(`select requires_review from workspaces`)).toEqual([{ requires_review: false }]);
    // Every task now has a variant of its own, for its own account, with the old text.
    expect(await rows(`
      select t.id as task, t.status, v.account_id = t.account_id as own, v.body, v.review_status
      from publish_tasks t join post_variants v on v.id = t.variant_id order by t.id`)).toEqual([
      { task: '00000000-0000-4000-8000-0000000000f1', status: 'published', own: true, body: 'TW text', review_status: 'approved' },
      { task: '00000000-0000-4000-8000-0000000000f2', status: 'scheduled', own: true, body: 'TW text', review_status: 'approved' },
      { task: '00000000-0000-4000-8000-0000000000f3', status: 'scheduled', own: true, body: 'JP text', review_status: 'pending' },
    ]);
    expect(await rows(`select count(*)::int as n from post_variants`)).toEqual([{ n: 3 }]);
    expect(await rows(`select to_regclass('public.markets') as t`)).toEqual([{ t: null }]);
    // 0005 recovers each post's author from the audit log; the main text was never kept.
    expect(await rows(`select created_by, body from posts`)).toEqual([{ created_by: 'editor@example.com', body: null }]);
  });
});
