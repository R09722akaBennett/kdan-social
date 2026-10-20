import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { auditLog, connectedAccounts, postVariants, publishTasks, workspaces, type Db } from '../src/db/index';
import { ComposeError, createPost, listPosts, setPublishing } from '../src/posts';
import { bootstrapWorkspace, listMarkets } from '../src/workspace';
import { KEY, testDb } from './helpers';

const NOW = new Date('2026-10-20T08:00:00Z');
const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const IMG = [{ url: 'https://cdn.example.com/a.jpg' }];

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, {
    name: 'KDAN Mobile', owner, markets: [
      { code: 'TW', name: '台灣', locale: 'zh-Hant-TW', timeZone: 'Asia/Taipei' },
      { code: 'US', name: '美國', locale: 'en-US', timeZone: 'America/New_York' },
    ],
  });
  const ms = await listMarkets(db, ws.id);
  const add = async (platform: 'facebook' | 'instagram', externalId: string, code: string, status: 'active' | 'expired' = 'active') => {
    const ref = { workspaceId: ws.id, platform, externalId };
    const [a] = await db.insert(connectedAccounts).values({
      ...ref, marketId: ms.find((m) => m.code === code)!.id, name: `${platform}-${code}`, status,
      credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)),
    }).returning();
    return a!.id;
  };
  const ids = { twFb: await add('facebook', 'f-tw', 'TW'), twIg: await add('instagram', 'i-tw', 'TW'), usFb: await add('facebook', 'f-us', 'US') };
  return { db, ws, ids };
}

const base = (ws: { id: string }, accountIds: string[]) => ({
  workspaceId: ws.id, actor: owner.email, role: 'owner' as const, body: '雙十一預告\n全方案 5 折', accountIds, media: IMG, schedule: { mode: 'now' as const }, now: NOW,
});

async function tasks(db: Db) {
  return db.select({ runAt: publishTasks.runAt, accountId: publishTasks.accountId, body: postVariants.body, review: postVariants.reviewStatus, platform: postVariants.platform })
    .from(publishTasks).innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId));
}

describe('createPost', () => {
  it('makes one version per market and platform and one task per account', async () => {
    const { db, ws, ids } = await setup();
    const res = await createPost(db, { ...base(ws, [ids.twFb, ids.twIg, ids.usFb]), overrides: { instagram: 'IG 版內文 #雙十一' } });
    expect(res.tasks).toBe(3);
    const t = await tasks(db);
    expect(t.find((x) => x.accountId === ids.twIg)!.body).toBe('IG 版內文 #雙十一');
    expect(t.find((x) => x.accountId === ids.usFb)!.body).toBe('雙十一預告\n全方案 5 折');
    expect(new Set(t.map((x) => x.review))).toEqual(new Set(['approved']));
    expect((await db.select().from(postVariants))).toHaveLength(3);
    expect((await db.select().from(auditLog)).map((a) => a.action)).toContain('post.created');
  });

  it('schedules each market at its own local time', async () => {
    const { db, ws, ids } = await setup();
    await createPost(db, { ...base(ws, [ids.twFb, ids.usFb]), schedule: { mode: 'local', date: '2026-11-11', time: '00:00' } });
    const t = await tasks(db);
    expect(t.find((x) => x.accountId === ids.twFb)!.runAt.toISOString()).toBe('2026-11-10T16:00:00.000Z');
    expect(t.find((x) => x.accountId === ids.usFb)!.runAt.toISOString()).toBe('2026-11-11T05:00:00.000Z');
  });

  it('schedules every market at the same instant in the viewer’s zone', async () => {
    const { db, ws, ids } = await setup();
    await createPost(db, { ...base(ws, [ids.twFb, ids.usFb]), schedule: { mode: 'same', date: '2026-10-20', time: '20:00' }, viewerTimeZone: 'Asia/Taipei' });
    expect(new Set((await tasks(db)).map((x) => x.runAt.toISOString()))).toEqual(new Set(['2026-10-20T12:00:00.000Z']));
  });

  it('leaves an editor’s post pending review', async () => {
    const { db, ws, ids } = await setup();
    await createPost(db, { ...base(ws, [ids.twFb]), role: 'editor' });
    expect((await tasks(db))[0]!.review).toBe('pending');
  });

  it('enforces platform rules before writing anything', async () => {
    const { db, ws, ids } = await setup();
    const tries: Array<[Partial<Parameters<typeof createPost>[1]>, RegExp]> = [
      [{ accountIds: [] }, /至少選一個/],
      [{ accountIds: [ids.twIg], media: [] }, /一定要附至少一張圖片/],
      [{ accountIds: [ids.twIg], overrides: { instagram: 'x'.repeat(2201) } }, /最多 2200 字/],
      [{ accountIds: [ids.twFb], body: '  ', media: [] }, /要有文字或圖片/],
      [{ accountIds: [ids.twFb], media: [{ url: 'http://insecure/a.jpg' }] }, /https/],
      [{ accountIds: [ids.twFb], schedule: { mode: 'local', date: '2026-10-19', time: '20:00' } }, /已經過了/],
      [{ accountIds: [ids.twFb], schedule: { mode: 'local', date: '2026-10-21', time: 'noon' } }, /格式不正確/],
      [{ accountIds: ['00000000-0000-4000-8000-0000000000ff'] }, /不屬於這個工作區/],
    ];
    for (const [patch, msg] of tries) {
      await expect(createPost(db, { ...base(ws, [ids.twFb]), ...patch })).rejects.toThrow(msg);
    }
    expect(await db.select().from(publishTasks)).toHaveLength(0);
  });

  it('refuses an account whose authorization expired', async () => {
    const { db, ws, ids } = await setup();
    await db.update(connectedAccounts).set({ status: 'expired' }).where(eq(connectedAccounts.id, ids.twFb));
    await expect(createPost(db, base(ws, [ids.twFb]))).rejects.toThrow(/授權已失效/);
  });

  it('lists posts with their tasks', async () => {
    const { db, ws, ids } = await setup();
    await createPost(db, base(ws, [ids.twFb, ids.usFb]));
    const [p] = await listPosts(db, ws.id);
    expect(p!.title).toBe('雙十一預告');
    expect(p!.tasks.map((t) => t.market).sort()).toEqual(['TW', 'US']);
  });
});

describe('setPublishing', () => {
  it('lets only an owner switch publishing, and records it', async () => {
    const { db, ws } = await setup();
    await expect(setPublishing(db, { workspaceId: ws.id, enabled: true, actor: 'x', role: 'admin' })).rejects.toThrow(ComposeError);
    await setPublishing(db, { workspaceId: ws.id, enabled: true, actor: owner.email, role: 'owner' });
    expect((await db.select().from(workspaces))[0]!.publishingEnabled).toBe(true);
    expect((await db.select().from(auditLog)).map((a) => a.action)).toContain('publishing.enabled');
  });
});
