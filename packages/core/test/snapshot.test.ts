import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { connectedAccounts, followerSnapshots } from '../src/db/index';
import { createClients } from '../src/index';
import { snapshotFollowers } from '../src/snapshot';
import { fakeFetch, KEY, seed, testDb } from './helpers';

const NOW = new Date('2026-10-20T16:30:00Z');

describe('snapshotFollowers', () => {
  it('saves the count for today and overwrites on a re-run', async () => {
    const db = await testDb();
    const { account } = await seed(db);
    const f = fakeFetch().on('GET', /page-1\?/, { body: { followers_count: 32904 } }, { body: { followers_count: 32910 } });
    await snapshotFollowers({ db, clients: createClients(f.fn), key: KEY, now: NOW });
    const summary = await snapshotFollowers({ db, clients: createClients(f.fn), key: KEY, now: NOW });
    expect(summary.saved).toBe(1);
    const rows = await db.select().from(followerSnapshots).where(eq(followerSnapshots.accountId, account.id));
    expect(rows).toEqual([expect.objectContaining({ day: '2026-10-20', followers: 32910 })]);
  });

  it('marks an account expired when its token is rejected', async () => {
    const db = await testDb();
    const { account } = await seed(db);
    const f = fakeFetch().on('GET', /page-1\?/, { status: 400, body: { error: { code: 190, message: 'Error validating access token' } } });
    const lines: string[] = [];
    expect((await snapshotFollowers({ db, clients: createClients(f.fn), key: KEY, now: NOW, log: (l) => lines.push(l) })).expired).toBe(1);
    const [a] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, account.id));
    expect(a!.status).toBe('expired');
    expect(lines[0]).toMatch(/authorization expired/);
  });

  it('counts a platform outage as failed without touching the account status', async () => {
    const db = await testDb();
    const { account } = await seed(db);
    const f = fakeFetch().on('GET', /page-1\?/, { status: 502, body: {} });
    expect((await snapshotFollowers({ db, clients: createClients(f.fn), key: KEY, now: NOW })).failed).toBe(1);
    const [a] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, account.id));
    expect(a!.status).toBe('active');
  });
});
