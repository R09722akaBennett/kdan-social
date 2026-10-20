import { describe, expect, it } from 'vitest';
import { notifications, posts, workspaceMembers, type Db } from '../src/db/index';
import { createClients } from '../src/index';
import { listNotifications, markRead, notify, unreadCount } from '../src/notifications';
import { createPost } from '../src/posts';
import { dispatchDue } from '../src/publish/dispatch';
import { commentOnPost, decidePost } from '../src/review';
import { fakeFetch, KEY, seed, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-0000000000a1', email: 'owner@example.com', role: 'owner' as const };
const admin = { userId: '00000000-0000-4000-8000-0000000000a2', email: 'admin@example.com', role: 'admin' as const };
const editor = { userId: '00000000-0000-4000-8000-0000000000a3', email: 'editor@example.com', role: 'editor' as const };

async function team(db: Db, workspaceId: string) {
  await db.insert(workspaceMembers).values([owner, admin, editor].map((m) => ({ workspaceId, ...m })));
}
const inbox = async (db: Db, workspaceId: string, who: { userId: string }) =>
  (await listNotifications(db, { workspaceId, userId: who.userId })).map((n) => n.kind);

describe('notify', () => {
  it('reaches named members and managers once each, never the actor or ex-members', async () => {
    const db = await testDb();
    const { ws } = await seed(db);
    await team(db, ws.id);
    const n = await notify(db, { workspaceId: ws.id, kind: 'post.commented', title: 't', emails: [editor.email, admin.email, 'gone@example.com', null], managers: true, actor: owner.email });
    expect(n).toBe(2);
    expect(await inbox(db, ws.id, owner)).toEqual([]);
    expect(await inbox(db, ws.id, admin)).toEqual(['post.commented']);
    expect(await inbox(db, ws.id, editor)).toEqual(['post.commented']);
    expect(await notify(db, { workspaceId: ws.id, kind: 'post.commented', title: 't', emails: [] })).toBe(0);
  });

  it('marks one or all read, and only the reader\'s own', async () => {
    const db = await testDb();
    const { ws } = await seed(db);
    await team(db, ws.id);
    await notify(db, { workspaceId: ws.id, kind: 'account.expired', title: 'a', href: '/app/channels', managers: true });
    await notify(db, { workspaceId: ws.id, kind: 'account.expired', title: 'b', managers: true });
    const [mine] = await listNotifications(db, { workspaceId: ws.id, userId: admin.userId });
    expect(await markRead(db, { workspaceId: ws.id, userId: owner.userId, id: mine!.id })).toBeNull();
    expect(await unreadCount(db, { workspaceId: ws.id, userId: admin.userId })).toBe(2);
    const first = (await listNotifications(db, { workspaceId: ws.id, userId: admin.userId })).find((x) => x.title === 'a')!;
    expect(await markRead(db, { workspaceId: ws.id, userId: admin.userId, id: first.id })).toBe('/app/channels');
    expect(await markRead(db, { workspaceId: ws.id, userId: admin.userId, id: first.id })).toBe('/app/channels');
    expect((await listNotifications(db, { workspaceId: ws.id, userId: admin.userId, unreadOnly: true })).map((x) => x.title)).toEqual(['b']);
    await markRead(db, { workspaceId: ws.id, userId: admin.userId });
    expect(await unreadCount(db, { workspaceId: ws.id, userId: admin.userId })).toBe(0);
    expect(await unreadCount(db, { workspaceId: ws.id, userId: owner.userId })).toBe(2);
  });
});

describe('events', () => {
  it('tells the author and managers when a post fails, and managers when the account expires', async () => {
    const db = await testDb();
    const { ws, post } = await seed(db, { publishing: true });
    await team(db, ws.id);
    await db.update(posts).set({ createdBy: editor.email });
    const f = fakeFetch().on('POST', /feed$/, { status: 400, body: { error: { code: 190, message: 'Session has expired' } } });
    await dispatchDue({ db, clients: createClients(f.fn), key: KEY, globalEnabled: true, now: new Date('2026-10-20T12:00:00Z') });
    expect((await inbox(db, ws.id, owner)).sort()).toEqual(['account.expired', 'publish.failed']);
    expect(await inbox(db, ws.id, editor)).toEqual(['publish.failed']);
    const [failed] = await listNotifications(db, { workspaceId: ws.id, userId: editor.userId });
    expect(failed).toMatchObject({ title: '「雙十一預告」沒有發到 KDAN Mobile 台灣', body: expect.stringContaining('Session has expired'), href: `/app/posts/${post.id}` });
  });

  it('says nothing for a dry run', async () => {
    const db = await testDb();
    const { ws } = await seed(db);
    await team(db, ws.id);
    await dispatchDue({ db, clients: createClients(fakeFetch().fn), key: KEY, globalEnabled: false, now: new Date('2026-10-20T12:00:00Z') });
    expect(await db.select().from(notifications)).toEqual([]);
  });

  it('follows a post through review: submitted, sent back, commented, approved', async () => {
    const db = await testDb();
    const { ws, account } = await seed(db);
    await team(db, ws.id);
    const { postId } = await createPost(db, { workspaceId: ws.id, actor: editor.email, role: 'editor', body: '新功能', accountIds: [account.id], media: [], schedule: { mode: 'now' }, now: new Date('2026-10-20T07:00:00Z') });
    expect(await inbox(db, ws.id, owner)).toEqual(['review.requested']);
    expect(await inbox(db, ws.id, editor)).toEqual([]);

    await decidePost(db, { workspaceId: ws.id, postId, decision: 'request_changes', comment: '日期改一下', actor: owner.email, role: 'owner' });
    await commentOnPost(db, { workspaceId: ws.id, postId, body: '好', actor: editor.email });
    await decidePost(db, { workspaceId: ws.id, postId, decision: 'approve', actor: admin.email, role: 'admin' });
    expect(await inbox(db, ws.id, editor)).toEqual(['review.approved', 'review.changes_requested']);
    // The owner commented through their decision, so the editor's reply reaches them.
    expect(await inbox(db, ws.id, owner)).toEqual(['post.commented', 'review.requested']);
  });

  it('does not ask for review when a manager posts', async () => {
    const db = await testDb();
    const { ws, account } = await seed(db);
    await team(db, ws.id);
    await createPost(db, { workspaceId: ws.id, actor: admin.email, role: 'admin', body: 'hi', accountIds: [account.id], media: [], schedule: { mode: 'now' }, now: new Date('2026-10-20T07:00:00Z') });
    expect(await db.select().from(notifications)).toEqual([]);
  });
});
