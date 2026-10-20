import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { connectedAccounts, followerSnapshots, postVariants, publishTasks } from '../src/db/index';
import { followerStats, overviewCounts, tasksBetween, upcomingTasks, weekStart } from '../src/overview';
import { createPost } from '../src/posts';
import { saveGroup } from '../src/groups';
import { bootstrapWorkspace } from '../src/workspace';
import { KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
// Tuesday 2026-10-20 16:00 in Taipei.
const NOW = new Date('2026-10-20T08:00:00Z');

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const add = async (externalId: string, timeZone: string) => {
    const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId };
    const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone, name: externalId, credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
    return a!.id;
  };
  const twFb = await add('tw-page', 'Asia/Taipei');
  const jpFb = await add('jp-page', 'Asia/Tokyo');
  const tw = await saveGroup(db, { workspaceId: ws.id, name: '台灣', accountIds: [twFb], actor: 'x', role: 'owner' });
  return { db, ws, tw, twFb, jpFb };
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

  it('narrows every number to the chosen groups, with null for ungrouped accounts', async () => {
    const { db, ws, tw } = await seeded();
    const c = await overviewCounts(db, { workspaceId: ws.id, now: NOW, groupIds: [tw] });
    expect(c.published).toEqual({ posts: 1, tasks: 1 });
    expect(c.failed.tasks).toBe(0);
    const ungrouped = await overviewCounts(db, { workspaceId: ws.id, now: NOW, groupIds: [null] });
    expect(ungrouped.failed.tasks).toBe(1);
    expect(ungrouped.pendingReview.tasks).toBe(0);
    expect((await overviewCounts(db, { workspaceId: ws.id, now: NOW, groupIds: [tw, null] })).published.tasks).toBe(2);
  });

  it('lists only tasks still waiting, soonest first, with each account’s clock', async () => {
    const { db, ws } = await seeded();
    const up = await upcomingTasks(db, { workspaceId: ws.id, now: NOW });
    expect(up.map((t) => t.status)).toEqual(['scheduled', 'scheduled', 'scheduled']);
    expect(up.map((t) => t.runAt.getTime())).toEqual([...up.map((t) => t.runAt.getTime())].sort((a, b) => a - b));
    // Tokyo is an hour ahead, so its 20:00 comes before Taipei's.
    expect(up[0]).toMatchObject({ timeZone: 'Asia/Tokyo', groupId: null, groupName: null });
    expect(up[1]).toMatchObject({ timeZone: 'Asia/Taipei', groupName: '台灣' });
  });

  it('returns tasks in a time window for the calendar', async () => {
    const { db, ws } = await seeded();
    const all = await tasksBetween(db, { workspaceId: ws.id, from: new Date('2026-10-19T00:00:00Z'), to: new Date('2026-10-26T00:00:00Z') });
    expect(all).toHaveLength(6);
    const none = await tasksBetween(db, { workspaceId: ws.id, from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-08T00:00:00Z') });
    expect(none).toHaveLength(0);
  });
});
