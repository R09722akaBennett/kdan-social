// Seed a local database with one account group, one fake Facebook page and one due post.
// The page token is a placeholder, so the post can only ever end as a dry run or an auth failure.
import { accountContext, encrypt, loadKey } from '../src/crypto';
import { accountGroups, connectedAccounts, createDb, postVariants, posts, publishTasks, workspaces } from '../src/db/index';

const url = process.env.DATABASE_URL;
if (!url || !/localhost|127\.0\.0\.1/.test(url)) {
  console.error('Refusing to seed: DATABASE_URL must point at a local database');
  process.exit(1);
}
const db = createDb(url);
const key = loadKey();

const [ws] = await db.insert(workspaces).values({ name: 'KDAN Mobile' }).returning();
const [group] = await db.insert(accountGroups).values({ workspaceId: ws!.id, name: '台灣' }).returning();
const ref = { workspaceId: ws!.id, platform: 'facebook' as const, externalId: 'dev-page-tw' };
const [account] = await db.insert(connectedAccounts).values({
  ...ref, groupId: group!.id, timeZone: 'Asia/Taipei', name: 'KDAN Mobile 台灣（測試）',
  credentials: encrypt(JSON.stringify({ pageAccessToken: 'placeholder' }), key, accountContext(ref)),
}).returning();
const [post] = await db.insert(posts).values({ workspaceId: ws!.id, title: '雙十一預告' }).returning();
const [variant] = await db.insert(postVariants).values({ postId: post!.id, accountId: account!.id, platform: 'facebook', body: 'PDF Reader 全方案 5 折', reviewStatus: 'approved' }).returning();
await db.insert(publishTasks).values({ variantId: variant!.id, accountId: account!.id, runAt: new Date() });
console.log(`Seeded workspace ${ws!.id} with 1 group, 1 account and 1 due task`);
process.exit(0);
