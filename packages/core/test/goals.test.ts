import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { accountPosts, auditLog, connectedAccounts, publishTasks } from '../src/db/index';
import { bestHour, GoalError, postingSlots, publishedThisWeek, setPostingGoal } from '../src/goals';
import { createPost } from '../src/posts';
import { bootstrapWorkspace } from '../src/workspace';
import { KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const TZ = 'Asia/Taipei';

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const ref = { workspaceId: ws.id, platform: 'instagram' as const, externalId: 'i1' };
  const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone: TZ, name: 'IG', credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
  return { db, ws, accountId: a!.id };
}

describe('posting goal', () => {
  it('sets and clears a weekly goal, refusing anything outside 1 to 21 or another workspace', async () => {
    const { db, ws, accountId } = await setup();
    await setPostingGoal(db, { workspaceId: ws.id, accountId, goal: 3, actor: owner.email });
    expect((await db.select().from(connectedAccounts))[0]!.postingGoal).toBe(3);
    await setPostingGoal(db, { workspaceId: ws.id, accountId, goal: null, actor: owner.email });
    expect((await db.select().from(connectedAccounts))[0]!.postingGoal).toBeNull();
    for (const goal of [0, 22, 2.5]) await expect(setPostingGoal(db, { workspaceId: ws.id, accountId, goal, actor: owner.email })).rejects.toThrow(GoalError);
    const other = await bootstrapWorkspace(db, { name: 'B', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } });
    await expect(setPostingGoal(db, { workspaceId: other.id, accountId, goal: 3, actor: 'b@example.com' })).rejects.toThrow(/找不到/);
    expect((await db.select().from(auditLog)).filter((r) => r.action === 'account.goal_set')).toHaveLength(2);
  });

  it('picks the best hour from history once there are ten posts, and the default before', async () => {
    const { db, accountId } = await setup();
    expect(await bestHour(db, { accountId, timeZone: TZ, platform: 'instagram' })).toEqual({ hour: 21, source: 'default', posts: 0 });
    // Nine at 09:00 Taipei doing badly, three at 19:00 doing well.
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => ({ at: `2026-10-0${i + 1}T01:00:00Z`, e: 2 })),
      ...Array.from({ length: 3 }, (_, i) => ({ at: `2026-10-1${i}T11:00:00Z`, e: 40 })),
    ];
    await db.insert(accountPosts).values(rows.map((r, i) => ({ accountId, externalId: `m${i}`, publishedAt: new Date(r.at), engagements: r.e })));
    expect(await bestHour(db, { accountId, timeZone: TZ, platform: 'instagram' })).toEqual({ hour: 19, source: 'history', posts: 12 });
  });

  it('counts only what was published since Monday on the account’s clock', async () => {
    const { db, ws, accountId } = await setup();
    const NOW = new Date('2026-10-22T04:00:00Z'); // Thursday 12:00 in Taipei
    const post = () => createPost(db, { workspaceId: ws.id, actor: owner.email, role: 'owner', body: 'x', accountIds: [accountId], media: [{ url: 'https://cdn.example.com/a.jpg' }], schedule: { mode: 'now' }, now: NOW });
    const ids = [await post(), await post(), await post()].map((p) => p.postId);
    const tasks = await db.select().from(publishTasks);
    await db.update(publishTasks).set({ status: 'published', finishedAt: new Date('2026-10-20T02:00:00Z') }).where(eq(publishTasks.id, tasks[0]!.id)); // Tue
    await db.update(publishTasks).set({ status: 'published', finishedAt: new Date('2026-10-18T02:00:00Z') }).where(eq(publishTasks.id, tasks[1]!.id)); // last Sun
    await db.update(publishTasks).set({ status: 'dry_run', finishedAt: new Date('2026-10-21T02:00:00Z') }).where(eq(publishTasks.id, tasks[2]!.id));
    expect(ids).toHaveLength(3);
    expect(await publishedThisWeek(db, { accountId, timeZone: TZ, now: NOW })).toBe(1);
  });
});

describe('postingSlots', () => {
  const NOW = new Date('2026-10-22T04:00:00Z'); // Thursday 12:00 in Taipei
  const at = (s: { date: string; time: string }) => `${s.date} ${s.time}`;

  it('spreads the goal over the next seven days at the hour, skipping the past', () => {
    expect(postingSlots({ goal: 3, hour: 20, timeZone: TZ, now: NOW, scheduled: [] }).map(at)).toEqual(['2026-10-22 20:00', '2026-10-24 20:00', '2026-10-26 20:00']);
    // 10:00 today has already gone by, so a daily goal starts tomorrow.
    expect(postingSlots({ goal: 7, hour: 10, timeZone: TZ, now: NOW, scheduled: [] })).toHaveLength(6);
  });

  it('stacks extra posts three hours earlier and drops days already filled', () => {
    const slots = postingSlots({ goal: 14, hour: 21, timeZone: TZ, now: NOW, scheduled: [new Date('2026-10-23T12:00:00Z')] });
    expect(slots.filter((s) => s.date === '2026-10-22').map((s) => s.time)).toEqual(['18:00', '21:00']);
    expect(slots.filter((s) => s.date === '2026-10-23').map((s) => s.time)).toEqual(['21:00']);
  });

  it('keeps each date once across a daylight-saving change', () => {
    // New York falls back on 2026-11-01. It is 23:30 on 10-31 there, so that day's 23:00 has
    // passed; the rest must follow one per date, with 11-01 neither repeated nor skipped.
    const slots = postingSlots({ goal: 7, hour: 23, timeZone: 'America/New_York', now: new Date('2026-11-01T03:30:00Z'), scheduled: [] });
    expect(slots.map((s) => s.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  });
});
