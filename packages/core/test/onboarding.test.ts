import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { auditLog, brandVoices, connectedAccounts, publishTasks, workspaces } from '../src/db/index';
import { createClients } from '../src/index';
import { aiUsage, createWorkspaceForUser, dismissOnboarding, setupProgress, updateWorkspaceSettings, WorkspaceError } from '../src/onboarding';
import { cancelPost, createPost } from '../src/posts';
import { dispatchDue } from '../src/publish/dispatch';
import { bootstrapWorkspace, membershipFor } from '../src/workspace';
import { fakeFetch, KEY, testDb } from './helpers';

const amy = { userId: '00000000-0000-4000-8000-0000000000a1', email: 'amy@example.com' };
const base = { ...amy, name: ' Bandai 台灣 ', timeZone: 'Asia/Tokyo', code: 'KDAN-2026', codes: ['KDAN-2026'] };

describe('createWorkspaceForUser', () => {
  it('creates a workspace owned by the person, on the chosen clock', async () => {
    const db = await testDb();
    const ws = await createWorkspaceForUser(db, base);
    expect(ws).toMatchObject({ name: 'Bandai 台灣', timeZone: 'Asia/Tokyo' });
    expect((await membershipFor(db, amy.userId))?.role).toBe('owner');
  });

  it('refuses when signup is off, the code is wrong, the person has one, or input is bad', async () => {
    const db = await testDb();
    await expect(createWorkspaceForUser(db, { ...base, codes: [] })).rejects.toThrow(/不開放/);
    await expect(createWorkspaceForUser(db, { ...base, code: 'nope' })).rejects.toThrow(/邀請碼不正確/);
    await expect(createWorkspaceForUser(db, { ...base, name: ' ' })).rejects.toThrow(/取個名字/);
    await expect(createWorkspaceForUser(db, { ...base, timeZone: 'Mars/Base' })).rejects.toThrow(/時區/);
    await createWorkspaceForUser(db, base);
    await expect(createWorkspaceForUser(db, base)).rejects.toThrow(/已經有工作區/);
  });
});

describe('workspace settings and setup progress', () => {
  it('lets owners and admins change name, clock and review; editors may not', async () => {
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner: amy });
    await expect(updateWorkspaceSettings(db, { workspaceId: ws.id, name: 'X', actor: 'e', role: 'editor' })).rejects.toThrow(WorkspaceError);
    await updateWorkspaceSettings(db, { workspaceId: ws.id, name: 'KDAN Mobile', timeZone: 'America/New_York', requiresReview: false, actor: amy.email, role: 'admin' });
    expect((await db.select().from(workspaces))[0]).toMatchObject({ name: 'KDAN Mobile', timeZone: 'America/New_York', requiresReview: false });
  });

  it('reads each step from what the workspace has, and remembers a dismissal', async () => {
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner: amy });
    expect(await setupProgress(db, ws.id)).toEqual({ accounts: false, groups: false, voice: false, members: false, testRun: false, publishing: false, dismissed: false });
    const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId: 'p' };
    const [acc] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: 'P', credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)) }).returning();
    await db.insert(brandVoices).values({ workspaceId: ws.id });
    const now = new Date('2026-10-20T08:00:00Z');
    await createPost(db, { workspaceId: ws.id, actor: amy.email, role: 'owner', body: 'hi', accountIds: [acc!.id], media: [], schedule: { mode: 'now' }, now });
    await dispatchDue({ db, clients: createClients(fakeFetch().fn), key: KEY, globalEnabled: false, now });
    await dismissOnboarding(db, { workspaceId: ws.id, actor: amy.email });
    expect(await setupProgress(db, ws.id)).toMatchObject({ accounts: true, voice: true, testRun: true, groups: false, dismissed: true });
  });

  it('sums AI usage per model over the window', async () => {
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner: amy });
    await db.insert(auditLog).values([
      { workspaceId: ws.id, actor: 'a', action: 'ai.used', detail: { model: 'vertex/gemini-3.8-flash', input: 100, output: 20 } },
      { workspaceId: ws.id, actor: 'a', action: 'ai.used', detail: { model: 'vertex/gemini-3.8-flash', input: 50, output: 10 } },
      { workspaceId: ws.id, actor: 'a', action: 'ai.used', detail: { model: 'vertex/claude-opus-5-5', input: 10, output: 5 } },
    ]);
    expect(await aiUsage(db, { workspaceId: ws.id, days: 30 })).toEqual([
      { model: 'vertex/gemini-3.8-flash', requests: 2, input: 150, output: 30 },
      { model: 'vertex/claude-opus-5-5', requests: 1, input: 10, output: 5 },
    ]);
  });
});

describe('cancelPost', () => {
  it('withdraws what has not gone out, keeps what has, and the dispatcher leaves it alone', async () => {
    const db = await testDb();
    const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner: amy });
    const add = async (id: string) => {
      const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId: id };
      const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: id, credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)) }).returning();
      return a!.id;
    };
    const [x, y] = [await add('x'), await add('y')];
    const now = new Date('2026-10-20T08:00:00Z');
    const { postId } = await createPost(db, { workspaceId: ws.id, actor: 'editor@example.com', role: 'owner', body: 'hi', accountIds: [x, y], media: [], schedule: { mode: 'local', date: '2026-10-22', time: '20:00' }, now });
    const { eq } = await import('drizzle-orm');
    await db.update(publishTasks).set({ status: 'published' }).where(eq(publishTasks.accountId, x));
    await expect(cancelPost(db, { workspaceId: ws.id, postId, actor: 'someone@example.com', role: 'editor' })).rejects.toThrow(/只有作者/);
    expect(await cancelPost(db, { workspaceId: ws.id, postId, actor: 'editor@example.com', role: 'editor' })).toEqual({ cancelled: 1 });
    expect((await db.select().from(publishTasks)).map((t) => t.status).sort()).toEqual(['cancelled', 'published']);
    const s = await dispatchDue({ db, clients: createClients(fakeFetch().fn), key: KEY, globalEnabled: false, now: new Date('2026-10-25T00:00:00Z') });
    expect(Object.values(s).reduce((n, v) => n + (typeof v === 'number' ? v : 0), 0)).toBe(0);
    await expect(cancelPost(db, { workspaceId: ws.id, postId, actor: amy.email, role: 'owner' })).rejects.toThrow(/沒有還在排程中/);
  });
});
