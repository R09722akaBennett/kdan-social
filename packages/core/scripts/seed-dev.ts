// Seed a local database with KDAN's three markets, one fake Facebook page and one due post.
// The page token is a placeholder, so the post can only ever end as a dry run or an auth failure.
import { accountContext, encrypt, loadKey } from '../src/crypto';
import { connectedAccounts, createDb, markets, postVariants, posts, publishTasks, workspaces } from '../src/db/index';

const url = process.env.DATABASE_URL;
if (!url || !/localhost|127\.0\.0\.1/.test(url)) {
  console.error('Refusing to seed: DATABASE_URL must point at a local database');
  process.exit(1);
}
const db = createDb(url);
const key = loadKey();

const [ws] = await db.insert(workspaces).values({ name: 'KDAN Mobile' }).returning();
const ms = await db.insert(markets).values([
  { workspaceId: ws!.id, code: 'TW', name: '台灣', locale: 'zh-Hant-TW', timeZone: 'Asia/Taipei' },
  { workspaceId: ws!.id, code: 'US', name: '美國', locale: 'en-US', timeZone: 'America/New_York' },
  { workspaceId: ws!.id, code: 'JP', name: '日本', locale: 'ja-JP', timeZone: 'Asia/Tokyo' },
]).returning();
const tw = ms.find((m) => m.code === 'TW')!;
const ref = { workspaceId: ws!.id, platform: 'facebook' as const, externalId: 'dev-page-tw' };
const [account] = await db.insert(connectedAccounts).values({
  ...ref, marketId: tw.id, name: 'KDAN Mobile 台灣（測試）',
  credentials: encrypt(JSON.stringify({ pageAccessToken: 'placeholder' }), key, accountContext(ref)),
}).returning();
const [post] = await db.insert(posts).values({ workspaceId: ws!.id, title: '雙十一預告' }).returning();
const [variant] = await db.insert(postVariants).values({ postId: post!.id, marketId: tw.id, platform: 'facebook', body: 'PDF Reader 全方案 5 折', reviewStatus: 'approved' }).returning();
await db.insert(publishTasks).values({ variantId: variant!.id, accountId: account!.id, runAt: new Date() });
console.log(`Seeded workspace ${ws!.id} with 3 markets, 1 account and 1 due task`);
process.exit(0);
