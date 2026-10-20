// Create a customer's workspace with its markets and first owner.
// Usage: DATABASE_URL=... tsx scripts/bootstrap-workspace.ts "<workspace name>" <owner email>
// The owner must have signed in once, so Supabase has created their user.
import { sql } from 'drizzle-orm';
import { createDb } from '../src/db/index';
import { bootstrapWorkspace } from '../src/workspace';

const [name, email] = process.argv.slice(2);
if (!name || !email) {
  console.error('Usage: bootstrap-workspace "<workspace name>" <owner email>');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const db = createDb(url);
const found = await db.execute(sql`select id from auth.users where lower(email) = lower(${email}) limit 1`);
const userId = (found as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
if (!userId) {
  console.error(`No user with email ${email}; sign in once at /login first`);
  process.exit(1);
}
const ws = await bootstrapWorkspace(db, {
  name,
  owner: { userId, email },
  markets: [
    { code: 'TW', name: '台灣', locale: 'zh-Hant-TW', timeZone: 'Asia/Taipei' },
    { code: 'US', name: '美國', locale: 'en-US', timeZone: 'America/New_York' },
    { code: 'JP', name: '日本', locale: 'ja-JP', timeZone: 'Asia/Tokyo' },
  ],
});
console.log(`Created workspace "${ws.name}" (${ws.id}) owned by ${email}`);
process.exit(0);
