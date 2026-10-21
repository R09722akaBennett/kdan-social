import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { accountPosts, auditLog, connectedAccounts, inboxComments, workspaces } from '../src/db/index';
import { InboxError, listInbox, openComments, replyToComment, setCommentStatus, syncComments } from '../src/inbox';
import { createClients } from '../src/index';
import { bootstrapWorkspace } from '../src/workspace';
import { fakeFetch, KEY, testDb } from './helpers';

const NOW = new Date('2026-10-21T08:00:00Z');
const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };

async function setup(platform: 'facebook' | 'instagram' = 'facebook') {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const ref = { workspaceId: ws.id, platform, externalId: platform === 'facebook' ? 'page-1' : 'ig-1' };
  const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: 'KDAN', credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)) }).returning();
  await db.insert(accountPosts).values([
    { accountId: a!.id, externalId: 'post_1', publishedAt: new Date('2026-10-18T00:00:00Z'), text: '雙十一預告' },
    // Outside the 14-day window, so never asked about.
    { accountId: a!.id, externalId: 'post_old', publishedAt: new Date('2026-09-01T00:00:00Z'), text: '舊的' },
  ]);
  const deps = (f: ReturnType<typeof fakeFetch>, globalEnabled = true) => ({ db, clients: createClients(f.fn), key: KEY, globalEnabled });
  return { db, ws, accountId: a!.id, deps };
}

const fbComments = { data: [
  { id: 'c1', message: '什麼時候開始？', from: { id: 'u1', name: '小明' }, created_time: '2026-10-20T01:00:00+0000' },
  { id: 'c2', message: '11/1 開始喔', from: { id: 'page-1', name: 'KDAN' }, created_time: '2026-10-20T02:00:00+0000', parent: { id: 'c1' } },
  { id: 'c3', message: '+1', from: { id: 'u2', name: '小華' }, created_time: '2026-10-20T03:00:00+0000', parent: { id: 'c1' } },
] };

describe('syncComments', () => {
  it('keeps people’s comments and replies, skips the page’s own, and keeps status on re-read', async () => {
    const { db, ws, accountId, deps } = await setup();
    const f = fakeFetch().on('GET', /post_1\/comments\?/, { body: fbComments });
    expect(await syncComments({ ...deps(f), now: NOW })).toEqual({ accounts: 1, comments: 2, failed: 0 });
    expect(f.calls.some((c) => c.url.includes('post_old'))).toBe(false);
    const open = await listInbox(db, { workspaceId: ws.id, status: 'open' });
    expect(open.map((r) => [r.comment.externalId, r.comment.author, r.comment.parentExternalId, r.postText])).toEqual([['c3', '小華', 'c1', '雙十一預告'], ['c1', '小明', null, '雙十一預告']]);
    expect(await openComments(db, ws.id)).toBe(2);

    await setCommentStatus(db, { workspaceId: ws.id, id: open[0]!.comment.id, status: 'done' });
    await syncComments({ ...deps(f), now: NOW });
    expect((await listInbox(db, { workspaceId: ws.id, status: 'done', accountId })).map((r) => r.comment.externalId)).toEqual(['c3']);
  });

  it('reads Instagram replies nested under their comment', async () => {
    const { db, ws, deps } = await setup('instagram');
    const f = fakeFetch().on('GET', /post_1\/comments\?/, { body: { data: [
      { id: 'i1', text: '好看', timestamp: '2026-10-20T01:00:00+0000', username: 'amy', from: { id: 'x1' }, replies: { data: [
        { id: 'i2', text: '謝謝！', timestamp: '2026-10-20T02:00:00+0000', username: 'kdan', from: { id: 'ig-1' } },
        { id: 'i3', text: '我也想要', timestamp: '2026-10-20T03:00:00+0000', username: 'ben', from: { id: 'x2' } },
      ] } },
    ] } });
    await syncComments({ ...deps(f), now: NOW });
    expect((await listInbox(db, { workspaceId: ws.id, status: 'open' })).map((r) => [r.comment.externalId, r.comment.parentExternalId])).toEqual([['i3', 'i1'], ['i1', null]]);
  });
});

describe('replyToComment', () => {
  async function withComment() {
    const s = await setup();
    const [c] = await s.db.insert(inboxComments).values({ accountId: s.accountId, externalId: 'c1', postExternalId: 'post_1', author: '小明', text: '什麼時候開始？', commentedAt: NOW }).returning();
    return { ...s, id: c!.id };
  }

  it('only logs a dry run while the workspace switch is off, leaving the comment open', async () => {
    const { db, ws, id, deps } = await withComment();
    const f = fakeFetch();
    const lines: string[] = [];
    expect(await replyToComment({ ...deps(f), log: (l) => lines.push(l) }, { workspaceId: ws.id, id, text: '11/1 開始', actor: owner.email })).toEqual({ dryRun: true });
    expect(f.calls).toHaveLength(0);
    expect(lines[0]).toMatch(/^\[dry-run\] Will reply to comment c1/);
    expect((await db.select().from(inboxComments))[0]!.status).toBe('open');
    expect((await db.select().from(auditLog)).map((r) => r.action)).toContain('comment.reply_dry_run');
  });

  it('replies in public when publishing is on and marks the comment done', async () => {
    const { db, ws, id, deps } = await withComment();
    await db.update(workspaces).set({ publishingEnabled: true });
    const f = fakeFetch().on('POST', /c1\/comments$/, { body: { id: 'c9' } });
    expect(await replyToComment(deps(f), { workspaceId: ws.id, id, text: ' 11/1 開始 ', actor: owner.email, now: NOW })).toEqual({ dryRun: false });
    expect(new URLSearchParams(f.calls[0]!.body).get('message')).toBe('11/1 開始');
    expect((await db.select().from(inboxComments))[0]).toMatchObject({ status: 'done', replyExternalId: 'c9', replyText: '11/1 開始', repliedBy: owner.email });
  });

  it('says to reconnect when the permission is missing, and refuses empty replies and other workspaces', async () => {
    const { db, ws, id, deps } = await withComment();
    await db.update(workspaces).set({ publishingEnabled: true });
    const f = fakeFetch().on('POST', /comments$/, { status: 403, body: { error: { message: '(#200) Requires pages_manage_engagement permission', code: 200 } } });
    await expect(replyToComment(deps(f), { workspaceId: ws.id, id, text: '好', actor: owner.email })).rejects.toThrow(/重新連結/);
    expect((await db.select().from(inboxComments).where(eq(inboxComments.id, id)))[0]!.status).toBe('open');
    await expect(replyToComment(deps(f), { workspaceId: ws.id, id, text: '  ', actor: owner.email })).rejects.toThrow(InboxError);
    const other = await bootstrapWorkspace(db, { name: 'B', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } });
    await expect(replyToComment(deps(f), { workspaceId: other.id, id, text: '好', actor: 'b@example.com' })).rejects.toThrow(/找不到/);
  });
});
