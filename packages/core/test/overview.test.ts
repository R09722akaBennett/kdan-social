import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { connectedAccounts, followerSnapshots, postVariants, publishTasks } from '../src/db/index';
import { followerStats, overviewCounts, tasksBetween, upcomingTasks, weekStart } from '../src/overview';
import { createPost } from '../src/posts';
import { bootstrapWorkspace, listMarkets } from '../src/workspace';
import { KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
// Tuesday 2026-10-20 16:00 in Taipei.
const NOW = new Date('2026-10-20T08:00:00Z');

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, {
    name: 'KDAN', owner, markets: [
      { code: 'TW', name: '台灣', locale: 'zh-Hant-TW', timeZone: 'Asia/Taipei' },
      { code: 'JP', name: '日本', locale: 'ja-JP', timeZone: 'Asia/Tokyo' },
    ],
  });
  const ms = await listMarkets(db, ws.id);
  const tw = ms.find((m) => m.code === 'TW')!;
  const jp = ms.find((m) => m.code === 'JP')!;
  const add = async (externalId: string, marketId: string) => {
    const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId };
    const [a] = await db.insert(connectedAccounts).values({ ...ref, marketId, name: externalId, credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
    return a!.id;
  };
  return { db, ws, tw, jp, twFb: await add('tw-page', tw.id), jpFb: await add('jp-page', jp.id) };
}

describe('weekStart', () => {
  it('is Monday 00:00 on the given clock', () => {
    expect(weekStart(NOW, 'Asia/Taipei').toISOString()).toBe('2026-10-18T16:00:00.000Z');
    // Sunday 23:30 in Taipei still belongs to the week that began the Monday before.
    expect(weekStart(new Date('2026-10-25T15:30:00Z'), 'Asia/Taipei').toISOString()).toBe('2026-10-18T16:00:00.000Z');
  });
});

describe('followerStats', () => {
  it('reports the latest count and the change against a week earlier', async () => {
    const { db, ws, twFb, jpFb } = await setup();
    await db.insert(followerSnapshots).values([
      { accountId: twFb, day: '2026-10-12', followers: 1000 },
      { accountId: twFb, day: '2026-10-13', followers: 1010 },
      { accountId: twFb, day: '2026-10-20', followers: 1100 },
      { accountId: jpFb, day: '2026-10-20', followers: 500 },
    ]);
    const stats = await followerStats(db, ws.id);
    expect(stats.get(twFb)).toEqual({ followers: 1100, day: '2026-10-20', delta7: 90 });
    expect(stats.get(jpFb)).toEqual({ followers: 500, day: '2026-10-20', delta7: null });
  });
});

describe('overview counts and upcoming tasks', () => {
  async function seeded() {
    const s = await setup();
    const make = (accountIds: string[], role: 'owner' | 'editor' = 'owner', schedule: Parameters<typeof createPost>[1]['schedule'] = { mode: 'local', date: '2026-10-22', time: '20:00' }) =>
      createPost(s.db, { workspaceId: s.ws.id, actor: 'x', role, body: `post ${Math.random()}`, accountIds, media: [], schedule, now: NOW });
    const published = await make([s.twFb, s.jpFb]);
    await s.db.update(publishTasks).set({ status: 'published', finishedAt: new Date('2026-10-19T12:00:00Z') });
    void published;
    await make([s.twFb], 'editor');
    const failing = await make([s.jpFb]);
    const [v] = await s.db.select().from(postVariants).where(eq(postVariants.postId, failing.postId));
    await s.db.update(publishTasks).set({ status: 'failed', finishedAt: new Date('2026-10-20T07:00:00Z') }).where(eq(publishTasks.variantId, v!.id));
    await make([s.twFb, s.jpFb]);
    return s;
  }

  it('counts this week’s published, pending review and recent failures', async () => {
    const { db, ws } = await seeded();
    const c = await overviewCounts(db, { workspaceId: ws.id, now: NOW });
    expect(c.published).toEqual({ posts: 1, tasks: 2 });
    expect(c.pendingReview).toEqual({ posts: 1, tasks: 1 });
    expect(c.failed).toEqual({ posts: 1, tasks: 1 });
  });

  it('narrows every number to one market', async () => {
    const { db, ws, tw } = await seeded();
    const c = await overviewCounts(db, { workspaceId: ws.id, now: NOW, marketId: tw.id });
    expect(c.published).toEqual({ posts: 1, tasks: 1 });
    expect(c.failed.tasks).toBe(0);
  });

  it('lists only tasks still waiting, soonest first, with their market', async () => {
    const { db, ws } = await seeded();
    const up = await upcomingTasks(db, { workspaceId: ws.id, now: NOW });
    expect(up.map((t) => t.status)).toEqual(['scheduled', 'scheduled', 'scheduled']);
    expect(up.map((t) => t.runAt.getTime())).toEqual([...up.map((t) => t.runAt.getTime())].sort((a, b) => a - b));
    // Tokyo is an hour ahead, so its 20:00 comes before Taipei's.
    expect(up[0]!.marketCode).toBe('JP');
  });

  it('returns tasks in a time window for the calendar', async () => {
    const { db, ws } = await seeded();
    const all = await tasksBetween(db, { workspaceId: ws.id, from: new Date('2026-10-19T00:00:00Z'), to: new Date('2026-10-26T00:00:00Z') });
    expect(all).toHaveLength(6);
    const none = await tasksBetween(db, { workspaceId: ws.id, from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-08T00:00:00Z') });
    expect(none).toHaveLength(0);
  });
});
