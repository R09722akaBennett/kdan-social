import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditLog, connectedAccounts, publishTasks, type Db } from '../src/db/index';
import { createClients } from '../src/index';
import { dispatchDue, MAX_ATTEMPTS } from '../src/publish/dispatch';
import { fakeFetch, KEY, seed, testDb } from './helpers';

const NOW = new Date('2026-10-20T12:00:30Z');

async function run(db: Db, f: ReturnType<typeof fakeFetch>, opts: { globalEnabled?: boolean; now?: Date } = {}) {
  const lines: string[] = [];
  const summary = await dispatchDue({ db, clients: createClients(f.fn), key: KEY, globalEnabled: opts.globalEnabled ?? true, now: opts.now ?? NOW, log: (l) => lines.push(l) });
  return { summary, lines };
}
const taskOf = async (db: Db, id: string) => (await db.select().from(publishTasks).where(eq(publishTasks.id, id)))[0]!;

describe('dispatchDue', () => {
  it('records a dry run and calls nothing while the workspace switch is off', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: false });
    const f = fakeFetch();
    const { summary, lines } = await run(db, f);
    expect(summary.dry_run).toBe(1);
    expect(f.calls).toHaveLength(0);
    expect(lines[0]).toMatch(/^\[dry-run\] Will publish "雙十一預告" to facebook KDAN Mobile 台灣 \(TW\)/);
    expect((await taskOf(db, task.id)).status).toBe('dry_run');
    expect((await db.select().from(auditLog))[0]!.action).toBe('publish.dry_run');
  });

  it('stays a dry run when the workspace is on but the deployment switch is off', async () => {
    const db = await testDb();
    await seed(db, { publishing: true });
    const f = fakeFetch();
    expect((await run(db, f, { globalEnabled: false })).summary.dry_run).toBe(1);
    expect(f.calls).toHaveLength(0);
  });

  it('publishes when both switches are on and keeps the platform post id', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: true });
    const f = fakeFetch().on('POST', /page-1\/feed$/, { body: { id: 'page-1_42' } });
    expect((await run(db, f)).summary.published).toBe(1);
    const t = await taskOf(db, task.id);
    expect(t.status).toBe('published');
    expect(t.externalPostId).toBe('page-1_42');
    expect(t.attempts).toBe(1);
  });

  it('leaves tasks that are not due yet', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: true, runAt: new Date('2026-10-20T13:00:00Z') });
    const f = fakeFetch();
    await run(db, f);
    expect((await taskOf(db, task.id)).status).toBe('scheduled');
  });

  it('does not publish a version nobody approved', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: true, review: 'pending' });
    const f = fakeFetch();
    expect((await run(db, f)).summary.missed).toBe(1);
    expect(f.calls).toHaveLength(0);
    expect((await taskOf(db, task.id)).lastError).toMatch(/Not approved/);
  });

  it('fails without calling the platform when the account is already expired', async () => {
    const db = await testDb();
    await seed(db, { publishing: true, accountStatus: 'expired' });
    const f = fakeFetch();
    expect((await run(db, f)).summary.failed).toBe(1);
    expect(f.calls).toHaveLength(0);
  });

  it('marks the account expired when the platform rejects the token', async () => {
    const db = await testDb();
    const { account } = await seed(db, { publishing: true });
    const f = fakeFetch().on('POST', /feed$/, { status: 400, body: { error: { code: 190, message: 'Session has expired' } } });
    expect((await run(db, f)).summary.failed).toBe(1);
    const [a] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, account.id));
    expect(a!.status).toBe('expired');
  });

  it('retries a throttled publish with backoff, then gives up', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: true });
    const f = fakeFetch().on('POST', /feed$/, { status: 400, body: { error: { code: 32, message: 'Page request limit reached' } } });
    let now = NOW;
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect((await run(db, f, { now })).summary.retrying).toBe(1);
      const t = await taskOf(db, task.id);
      expect(t.status).toBe('scheduled');
      expect(t.runAt.getTime()).toBe(now.getTime() + 60_000 * 2 ** (i - 1));
      now = t.runAt;
    }
    expect((await run(db, f, { now })).summary.failed).toBe(1);
    expect((await taskOf(db, task.id)).lastError).toMatch(/gave up after 3 attempts/);
    expect(f.calls).toHaveLength(MAX_ATTEMPTS);
  });

  it('asks a human to check instead of retrying when the outcome is unknown', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: true });
    const f = fakeFetch().on('POST', /feed$/, { status: 503, body: {} });
    expect((await run(db, f)).summary.needs_check).toBe(1);
    await run(db, f, { now: new Date(NOW.getTime() + 3600_000) });
    expect(f.calls).toHaveLength(1);
    expect((await taskOf(db, task.id)).status).toBe('needs_check');
  });

  it('sets aside a task left running by an invocation that died', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: true });
    await db.update(publishTasks).set({ status: 'running', startedAt: new Date(NOW.getTime() - 11 * 60_000) }).where(eq(publishTasks.id, task.id));
    const f = fakeFetch();
    expect((await run(db, f)).summary.recovered).toBe(1);
    expect((await taskOf(db, task.id)).status).toBe('needs_check');
    expect(f.calls).toHaveLength(0);
  });

  it('never leaks the token into stored errors or logs', async () => {
    const db = await testDb();
    const { task } = await seed(db, { publishing: true });
    const f = fakeFetch().on('POST', /feed$/, { status: 400, body: { error: { code: 100, message: 'bad request access_token=secret-page-token' } } });
    const { lines } = await run(db, f);
    expect((await taskOf(db, task.id)).lastError).not.toContain('secret-page-token');
    expect(lines.join('\n')).not.toContain('secret-page-token');
  });
});
