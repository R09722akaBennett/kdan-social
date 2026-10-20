import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { auditLog, connectedAccounts, postVariants, publishTasks } from '../src/db/index';
import { createPost } from '../src/posts';
import { dispatchDue } from '../src/publish/dispatch';
import { createClients } from '../src/index';
import { commentOnPost, decidePost, reviewDetail, ReviewError, reviewQueue } from '../src/review';
import { bootstrapWorkspace } from '../src/workspace';
import { fakeFetch, KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const NOW = new Date('2026-10-20T08:00:00Z');

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const add = async (externalId: string, timeZone: string) => {
    const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId };
    const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone, name: externalId, credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
    return a!.id;
  };
  const tw = await add('tw-page', 'Asia/Taipei');
  const us = await add('us-page', 'America/New_York');
  const post = (role: 'owner' | 'editor', perAccount?: Record<string, string>) => createPost(db, {
    workspaceId: ws.id, actor: role === 'editor' ? 'editor@example.com' : owner.email, role, body: '雙十一預告', perAccount,
    accountIds: [tw, us], media: [], schedule: { mode: 'local', date: '2026-10-22', time: '20:00' }, now: NOW,
  });
  return { db, ws, tw, us, post };
}

const by = (role: 'owner' | 'admin' | 'editor' | 'reviewer' = 'owner') => ({ actor: owner.email, role });

describe('reviewQueue', () => {
  it('lists an editor’s post as pending and leaves out an owner’s own', async () => {
    const { db, ws, post } = await setup();
    const { postId } = await post('editor');
    await post('owner');
    const q = await reviewQueue(db, { workspaceId: ws.id, now: NOW });
    expect(q.map((x) => [x.postId, x.state, x.createdBy, x.accounts.length])).toEqual([[postId, 'pending', 'editor@example.com', 2]]);
  });

  it('keeps an approved post listed while it still waits to go out, and drops it once nothing is scheduled', async () => {
    const { db, ws, post } = await setup();
    const { postId } = await post('editor');
    await decidePost(db, { workspaceId: ws.id, postId, decision: 'approve', ...by() });
    expect((await reviewQueue(db, { workspaceId: ws.id, now: NOW }))[0]!.state).toBe('approved');
    await db.update(publishTasks).set({ status: 'published' });
    expect(await reviewQueue(db, { workspaceId: ws.id, now: NOW })).toEqual([]);
  });
});

describe('reviewDetail', () => {
  it('marks which accounts were customised against the main text', async () => {
    const { db, ws, us, post } = await setup();
    const { postId } = await post('editor', { [us]: '11.11 Sale' });
    const d = (await reviewDetail(db, { workspaceId: ws.id, postId }))!;
    expect(d.post.body).toBe('雙十一預告');
    expect(d.versions.map((v) => [v.name, v.customised, v.body])).toEqual(expect.arrayContaining([['tw-page', false, '雙十一預告'], ['us-page', true, '11.11 Sale']]));
    expect(d.history.map((h) => h.action)).toEqual(['post.created']);
    expect(d.open).toBe(true);
  });

  it('returns null for a post in another workspace', async () => {
    const { db, post } = await setup();
    const { postId } = await post('editor');
    const other = await bootstrapWorkspace(db, { name: 'Other', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'x@example.com' } });
    expect(await reviewDetail(db, { workspaceId: other.id, postId })).toBeNull();
  });
});

describe('decidePost', () => {
  it('approves every account at once, and the dispatcher then sends them', async () => {
    const { db, ws, post } = await setup();
    const { postId } = await post('editor');
    await decidePost(db, { workspaceId: ws.id, postId, decision: 'approve', comment: '可以', ...by('admin') });
    expect(new Set((await db.select().from(postVariants)).map((v) => v.reviewStatus))).toEqual(new Set(['approved']));
    const d = (await reviewDetail(db, { workspaceId: ws.id, postId }))!;
    expect(d.comments.map((c) => c.body)).toEqual(['可以']);
    expect(d.history.map((h) => h.action)).toEqual(['post.created', 'post.approved']);
    const summary = await dispatchDue({ db, clients: createClients(fakeFetch().fn), key: KEY, globalEnabled: false, now: new Date('2026-10-23T02:00:00Z') });
    expect(summary.dry_run).toBe(2);
  });

  it('sends a post back with a required comment, and the dispatcher skips it', async () => {
    const { db, ws, post } = await setup();
    const { postId } = await post('editor');
    await expect(decidePost(db, { workspaceId: ws.id, postId, decision: 'request_changes', comment: '  ', ...by() })).rejects.toThrow(/寫下要改的地方/);
    await decidePost(db, { workspaceId: ws.id, postId, decision: 'request_changes', comment: '日文版用語要統一', ...by() });
    expect((await reviewQueue(db, { workspaceId: ws.id, now: NOW }))[0]!.state).toBe('changes_requested');
    const summary = await dispatchDue({ db, clients: createClients(fakeFetch().fn), key: KEY, globalEnabled: false, now: new Date('2026-10-23T02:00:00Z') });
    expect(summary.missed).toBe(2);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'post.changes_requested')))[0]!.detail).toMatchObject({ comment: '日文版用語要統一' });
  });

  it('refuses editors and reviewers, foreign posts, and posts with nothing left to send', async () => {
    const { db, ws, post } = await setup();
    const { postId } = await post('editor');
    await expect(decidePost(db, { workspaceId: ws.id, postId, decision: 'approve', ...by('editor') })).rejects.toThrow(ReviewError);
    await expect(decidePost(db, { workspaceId: ws.id, postId, decision: 'approve', ...by('reviewer') })).rejects.toThrow(/擁有者或管理員/);
    await expect(decidePost(db, { workspaceId: ws.id, postId: '00000000-0000-4000-8000-0000000000ff', decision: 'approve', ...by() })).rejects.toThrow(/找不到/);
    await db.update(publishTasks).set({ status: 'missed' });
    await expect(decidePost(db, { workspaceId: ws.id, postId, decision: 'approve', ...by() })).rejects.toThrow(/已經過了/);
    expect(new Set((await db.select().from(postVariants)).map((v) => v.reviewStatus))).toEqual(new Set(['pending']));
  });
});

describe('commentOnPost', () => {
  it('lets anyone comment without deciding', async () => {
    const { db, ws, post } = await setup();
    const { postId } = await post('editor');
    await commentOnPost(db, { workspaceId: ws.id, postId, body: ' 改好了，請再看一次 ', actor: 'editor@example.com' });
    await expect(commentOnPost(db, { workspaceId: ws.id, postId, body: ' ', actor: 'x' })).rejects.toThrow(/空的/);
    const d = (await reviewDetail(db, { workspaceId: ws.id, postId }))!;
    expect(d.comments.map((c) => [c.author, c.body])).toEqual([['editor@example.com', '改好了，請再看一次']]);
    expect(d.state).toBe('pending');
  });
});
