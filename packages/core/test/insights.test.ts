import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { accountDailyMetrics, audienceBreakdowns, connectedAccounts, postMetrics, publishTasks } from '../src/db/index';
import { createClients } from '../src/index';
import { lineClient } from '../src/platforms/line';
import { facebookClient, instagramClient } from '../src/platforms/meta';
import { createPost } from '../src/posts';
import { collectInsights } from '../src/snapshot';
import { bootstrapWorkspace } from '../src/workspace';
import { fakeFetch, KEY, testDb } from './helpers';

const page = { externalId: 'page-1', credentials: { pageAccessToken: 't' } };
const ig = { externalId: 'ig-1', credentials: { pageAccessToken: 't' } };
const since = new Date('2026-10-18T00:00:00Z');
const until = new Date('2026-10-20T00:00:00Z');
const denied = { status: 400, body: { error: { code: 10, message: '(#10) Not enough permission' } } };

describe('Facebook insights', () => {
  it('maps each daily metric to the day it covers and reports the ones Meta refuses', async () => {
    const values = (a: number, b: number) => ({ body: { data: [{ values: [{ value: a, end_time: '2026-10-19T07:00:00+0000' }, { value: b, end_time: '2026-10-20T07:00:00+0000' }] }] } });
    const f = fakeFetch()
      .on('GET', /metric=page_media_view&/, values(100, 120))
      .on('GET', /metric=page_total_media_view_unique&/, values(80, 90))
      .on('GET', /metric=page_post_engagements&/, values(5, 6))
      .on('GET', /metric=page_daily_follows_unique&/, denied)
      .on('GET', /metric=page_daily_unfollows_unique&/, values(0, 1));
    const { value, issues } = await facebookClient(f.fn).dailyInsights!(page, since, until);
    expect(value).toEqual([
      { day: '2026-10-18', metrics: { views: 100, reach: 80, engagements: 5, unfollows: 0 } },
      { day: '2026-10-19', metrics: { views: 120, reach: 90, engagements: 6, unfollows: 1 } },
    ]);
    expect(issues.map((i) => i.metric)).toEqual(['page_daily_follows_unique']);
  });

  it('reads a post’s views, reach and reactions by type', async () => {
    const f = fakeFetch()
      .on('GET', /1_2\/insights\?metric=post_media_view&/, { body: { data: [{ values: [{ value: 340 }] }] } })
      .on('GET', /1_2\/insights\?metric=post_total_media_view_unique&/, { body: { data: [{ values: [{ value: 210 }] }] } })
      .on('GET', /1_2\/insights\?metric=post_reactions_by_type_total&/, { body: { data: [{ values: [{ value: { like: 7, love: 2 } }] }] } });
    expect((await facebookClient(f.fn).postInsights!(page, '1_2')).value).toEqual({ views: 340, reach: 210, detail: { reaction_like: 7, reaction_love: 2 } });
  });

  it('turns follower country counts into a sorted breakdown', async () => {
    const f = fakeFetch()
      .on('GET', /metric=page_follows_country/, { body: { data: [{ values: [{ value: { US: 3, TW: 120 } }] }] } })
      .on('GET', /metric=page_follows_city/, denied);
    const { value, issues } = await facebookClient(f.fn).demographics!(page, until);
    expect(value).toEqual([{ kind: 'country', unit: 'count', items: [{ key: 'TW', value: 120 }, { key: 'US', value: 3 }] }]);
    expect(issues).toHaveLength(1);
  });
});

describe('Instagram insights', () => {
  it('reads one day at a time, splits follows from unfollows, and stops asking for a refused metric', async () => {
    const total = (v: number) => ({ body: { data: [{ total_value: { value: v } }] } });
    const f = fakeFetch()
      .on('GET', /metric=reach&/, total(50))
      .on('GET', /metric=views&/, total(70))
      .on('GET', /metric=accounts_engaged&/, denied)
      .on('GET', /metric=total_interactions&/, total(9))
      .on('GET', /metric=profile_links_taps&/, total(1))
      .on('GET', /metric=follows_and_unfollows&/, { body: { data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['FOLLOWER'], value: 4 }, { dimension_values: ['NON_FOLLOWER'], value: 1 }] }] } }] } });
    const { value, issues } = await instagramClient(f.fn).dailyInsights!(ig, since, until);
    expect(value.map((d) => d.day)).toEqual(['2026-10-18', '2026-10-19']);
    expect(value[0]!.metrics).toEqual({ reach: 50, views: 70, engagements: 9, profileLinkTaps: 1, follows: 4, unfollows: 1 });
    expect(issues.map((i) => i.metric)).toEqual(['accounts_engaged']);
    expect(f.calls.filter((c) => c.url.includes('metric=accounts_engaged'))).toHaveLength(1);
  });

  it('falls back to one metric at a time when a post rejects the combined request', async () => {
    const f = fakeFetch()
      .on('GET', /m1\/insights\?metric=reach%2C/, { status: 400, body: { error: { code: 100, message: 'metric not supported for this media' } } })
      .on('GET', /m1\/insights\?metric=reach&/, { body: { data: [{ values: [{ value: 300 }] }] } })
      .on('GET', /m1\/insights\?metric=views&/, { body: { data: [{ values: [{ value: 900 }] }] } })
      .on('GET', /m1\/insights\?metric=saved&/, { body: { data: [{ values: [{ value: 12 }] }] } })
      .on('GET', /m1\/insights\?metric=(shares|total_interactions|follows|profile_visits)&/, { status: 400, body: { error: { code: 100, message: 'unsupported' } } });
    const { value, issues } = await instagramClient(f.fn).postInsights!(ig, 'm1');
    expect(value).toEqual({ reach: 300, views: 900, detail: { saved: 12 } });
    expect(issues).toHaveLength(4);
  });

  it('reads follower demographics, or reports them missing below Meta’s threshold', async () => {
    const f = fakeFetch()
      .on('GET', /breakdown=age/, { body: { data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['25-34'], value: 40 }, { dimension_values: ['18-24'], value: 60 }] }] } }] } })
      .on('GET', /breakdown=(gender|country|city)/, { status: 400, body: { error: { code: 10, message: 'Not enough followers' } } });
    const { value, issues } = await instagramClient(f.fn).demographics!(ig, until);
    expect(value).toEqual([{ kind: 'age', unit: 'count', items: [{ key: '18-24', value: 60 }, { key: '25-34', value: 40 }] }]);
    expect(issues.map((i) => i.metric)).toEqual(['follower_demographics:gender', 'follower_demographics:country', 'follower_demographics:city']);
  });
});

describe('LINE demographics', () => {
  it('reads percentages, or says why there are none', async () => {
    const acc = { externalId: '200', credentials: { channelId: '200', channelSecret: 'a'.repeat(32) } };
    const ok = fakeFetch().on('POST', /token$/, { body: { access_token: 'x' } })
      .on('GET', /demographic$/, { body: { available: true, genders: [{ gender: 'female', percentage: 60.5 }, { gender: 'male', percentage: 39.5 }], ages: [], areas: [{ area: '台北', percentage: 30 }] } });
    expect((await lineClient(ok.fn).demographics!(acc, until)).value).toEqual([
      { kind: 'gender', unit: 'percent', items: [{ key: 'female', value: 60.5 }, { key: 'male', value: 39.5 }] },
      { kind: 'area', unit: 'percent', items: [{ key: '台北', value: 30 }] },
    ]);
    const none = fakeFetch().on('POST', /token$/, { body: { access_token: 'x' } }).on('GET', /demographic$/, { body: { available: false } });
    expect((await lineClient(none.fn).demographics!(acc, until)).issues[0]!.message).toMatch(/20 friends/);
  });
});

describe('collectInsights', () => {
  it('stores days, audience and post reach, and logs each refused metric once without failing the account', async () => {
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner: { userId: '00000000-0000-4000-8000-000000000001', email: 'o@example.com' } });
    const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId: 'page-1' };
    const [acc] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: 'KDAN TW', credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)) }).returning();
    const now = new Date('2026-10-20T16:30:00Z');
    await createPost(db, { workspaceId: ws.id, actor: 'x', role: 'owner', body: 'hi', accountIds: [acc!.id], media: [], schedule: { mode: 'now' }, now });
    await db.update(publishTasks).set({ status: 'published', finishedAt: now, externalPostId: '1_2' });
    const f = fakeFetch()
      .on('GET', /page-1\/insights\?metric=page_media_view&/, { body: { data: [{ values: [{ value: 10, end_time: '2026-10-19T07:00:00+0000' }] }] } })
      .on('GET', /page-1\/insights\?metric=page_follows_country/, { body: { data: [{ values: [{ value: { TW: 5 } }] }] } })
      .on('GET', /1_2\/insights\?metric=post_total_media_view_unique&/, { body: { data: [{ values: [{ value: 42 }] }] } })
      .on('GET', /insights/, denied);
    const lines: string[] = [];
    const s = await collectInsights({ db, clients: createClients(f.fn), key: KEY, now, log: (l) => lines.push(l) });
    expect(s).toMatchObject({ accounts: 1, days: 1, audiences: 1, posts: 1, failed: 0 });
    expect((await db.select().from(accountDailyMetrics))[0]).toMatchObject({ day: '2026-10-18', metrics: { views: 10 } });
    expect((await db.select().from(audienceBreakdowns))[0]).toMatchObject({ kind: 'country', items: [{ key: 'TW', value: 5 }] });
    expect((await db.select().from(postMetrics))[0]).toMatchObject({ reach: 42, views: null });
    expect(lines.filter((l) => l.includes('page_post_engagements'))).toHaveLength(1);
    expect(lines.every((l) => l.startsWith('Insight unavailable for KDAN TW (facebook)'))).toBe(true);
    expect((await db.select().from(connectedAccounts))[0]!.status).toBe('active');
  });
});

describe('analytics queries over collected insights', () => {
  it('sums the period and the one before it, per day and per account, within the group filter', async () => {
    const { dailyTotals, audienceFor } = await import('../src/analytics');
    const { saveGroup } = await import('../src/groups');
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner: { userId: '00000000-0000-4000-8000-000000000001', email: 'o@example.com' } });
    const add = async (externalId: string) => {
      const ref = { workspaceId: ws.id, platform: 'instagram' as const, externalId };
      const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: externalId, credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
      return a!.id;
    };
    const [x, y] = [await add('x'), await add('y')];
    const tw = await saveGroup(db, { workspaceId: ws.id, name: '台灣', accountIds: [x], actor: 'o', role: 'owner' });
    await db.insert(accountDailyMetrics).values([
      { accountId: x, day: '2026-10-12', metrics: { reach: 10, views: 20 } },
      { accountId: x, day: '2026-10-18', metrics: { reach: 30, views: 50, follows: 2, unfollows: 1 } },
      { accountId: x, day: '2026-10-19', metrics: { reach: 40, views: 60 } },
      { accountId: y, day: '2026-10-19', metrics: { reach: 5, views: 5 } },
    ]);
    const from = new Date('2026-10-14T00:00:00Z');
    const to = new Date('2026-10-21T00:00:00Z');
    const all = await dailyTotals(db, { workspaceId: ws.id, from, to });
    expect(all.current).toEqual({ reach: 75, views: 115, engagements: null, follows: 2, unfollows: 1 });
    expect(all.previous).toMatchObject({ reach: 10, views: 20 });
    expect(all.days.map((d) => [d.day, d.reach])).toEqual([['2026-10-18', 30], ['2026-10-19', 45]]);
    expect(all.byAccount.get(y)).toMatchObject({ reach: 5 });
    expect((await dailyTotals(db, { workspaceId: ws.id, from, to, groupIds: [tw] })).current.reach).toBe(70);
    expect((await dailyTotals(db, { workspaceId: ws.id, from, to, accountId: y })).current).toMatchObject({ reach: 5, views: 5 });

    await db.insert(audienceBreakdowns).values([
      { accountId: x, kind: 'city', unit: 'count', items: [{ key: 'Taipei', value: 9 }] },
      { accountId: x, kind: 'age', unit: 'count', items: [{ key: '25-34', value: 5 }] },
    ]);
    expect((await audienceFor(db, { workspaceId: ws.id })).get(x)!.map((b) => b.kind)).toEqual(['age', 'city']);
    expect((await audienceFor(db, { workspaceId: ws.id, accountId: y })).size).toBe(0);
  });
});
