import { describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/index';
import { acceptInviteLink, changeRole, inviteByToken, inviteMember, listInvites, listMembers, MemberError, removeMember, revokeInvite } from '../src/members';
import { bootstrapWorkspace, listMemberships, membershipFor } from '../src/workspace';
import { testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const amy = '00000000-0000-4000-8000-0000000000a1';
const ben = '00000000-0000-4000-8000-0000000000b1';
const asOwner = { actor: owner.email, actorId: owner.userId, actorRole: 'owner' as const };

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  return { db, ws };
}

describe('invites', () => {
  it('lets whoever opens the invite link join with its role, once', async () => {
    const { db, ws } = await setup();
    const first = await inviteMember(db, { workspaceId: ws.id, email: ' Amy@Example.com ', role: 'editor', ...asOwner });
    const again = await inviteMember(db, { workspaceId: ws.id, email: 'amy@example.com', role: 'admin', ...asOwner });
    expect(again.token).toBe(first.token);
    expect(first.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await listInvites(db, ws.id)).map((i) => [i.email, i.role])).toEqual([['amy@example.com', 'admin']]);
    expect(await inviteByToken(db, first.token)).toMatchObject({ workspace: 'KDAN', role: 'admin', email: 'amy@example.com', invitedBy: owner.email });

    // The person signs up with another address; the link, not the email, admits them.
    const joined = await acceptInviteLink(db, { token: first.token, userId: amy, email: 'Amy.Work@example.com' });
    expect(joined?.id).toBe(ws.id);
    expect(await membershipFor(db, amy)).toMatchObject({ role: 'admin' });
    expect((await listMembers(db, ws.id)).map((m) => m.email)).toContain('amy.work@example.com');
    expect(await listInvites(db, ws.id)).toEqual([]);
    expect(await acceptInviteLink(db, { token: first.token, userId: ben, email: 'ben@example.com' })).toBeNull();
    expect(await inviteByToken(db, first.token)).toBeNull();
    expect(await acceptInviteLink(db, { token: 'not-a-token', userId: ben, email: 'ben@example.com' })).toBeNull();
    expect((await db.select().from(auditLog)).map((r) => r.action)).toEqual(expect.arrayContaining(['member.invited', 'member.joined']));
  });

  it('adds a workspace to someone already in another, and keeps a member\'s role', async () => {
    const { db, ws } = await setup();
    const other = await bootstrapWorkspace(db, { name: '客戶 B', owner: { userId: ben, email: 'ben@example.com' } });
    const toKdan = await inviteMember(db, { workspaceId: ws.id, email: 'amy@example.com', role: 'editor', ...asOwner });
    const toB = await inviteMember(db, { workspaceId: other.id, email: 'amy@example.com', role: 'admin', actor: 'ben@example.com', actorRole: 'owner' });
    await acceptInviteLink(db, { token: toKdan.token, userId: amy, email: 'amy@example.com' });
    await acceptInviteLink(db, { token: toB.token, userId: amy, email: 'amy@example.com' });
    expect((await listMemberships(db, amy)).map((m) => [m.name, m.role])).toEqual([['KDAN', 'editor'], ['客戶 B', 'admin']]);
    // Inviting by another address and opening it while already a member changes nothing.
    const dup = await inviteMember(db, { workspaceId: ws.id, email: 'amy2@example.com', role: 'admin', ...asOwner });
    await acceptInviteLink(db, { token: dup.token, userId: amy, email: 'amy@example.com' });
    expect((await membershipFor(db, amy, ws.id))?.role).toBe('editor');
  });

  it('refuses bad input, existing members, owner as a role, and non-managers', async () => {
    const { db, ws } = await setup();
    const tries: Array<[Partial<Parameters<typeof inviteMember>[1]>, RegExp]> = [
      [{ email: 'not-an-email' }, /格式不正確/],
      [{ email: 'owner@example.com' }, /已經是成員/],
      [{ role: 'owner' }, /不認得這個角色/],
      [{ role: 'reviewer' }, /不認得這個角色/],
      [{ actorRole: 'editor' }, /擁有者或管理員/],
    ];
    for (const [patch, msg] of tries) {
      await expect(inviteMember(db, { workspaceId: ws.id, email: 'x@example.com', role: 'editor', ...asOwner, ...patch })).rejects.toThrow(msg);
    }
    expect(await listInvites(db, ws.id)).toEqual([]);
  });

  it('withdraws an invite so the address can no longer join', async () => {
    const { db, ws } = await setup();
    await inviteMember(db, { workspaceId: ws.id, email: 'amy@example.com', role: 'editor', ...asOwner });
    const [inv] = await listInvites(db, ws.id);
    await expect(revokeInvite(db, { workspaceId: ws.id, inviteId: inv!.id, actor: 'x', actorRole: 'editor' })).rejects.toThrow(MemberError);
    await revokeInvite(db, { workspaceId: ws.id, inviteId: inv!.id, ...asOwner });
    expect(await acceptInviteLink(db, { token: inv!.token, userId: amy, email: 'amy@example.com' })).toBeNull();
  });
});

describe('roles and removal', () => {
  async function withAmy() {
    const s = await setup();
    const { token } = await inviteMember(s.db, { workspaceId: s.ws.id, email: 'amy@example.com', role: 'editor', ...asOwner });
    await acceptInviteLink(s.db, { token, userId: amy, email: 'amy@example.com' });
    return s;
  }

  it('changes a member’s role but never the owner’s or one’s own', async () => {
    const { db, ws } = await withAmy();
    await changeRole(db, { workspaceId: ws.id, userId: amy, role: 'admin', ...asOwner });
    expect((await membershipFor(db, amy))?.role).toBe('admin');
    const asAmy = { actor: 'amy@example.com', actorId: amy, actorRole: 'admin' as const };
    await expect(changeRole(db, { workspaceId: ws.id, userId: owner.userId, role: 'editor', ...asAmy })).rejects.toThrow(/擁有者的角色/);
    await expect(changeRole(db, { workspaceId: ws.id, userId: amy, role: 'editor', ...asAmy })).rejects.toThrow(/自己的角色/);
    await expect(changeRole(db, { workspaceId: ws.id, userId: ben, role: 'editor', ...asOwner })).rejects.toThrow(/找不到/);
  });

  it('removes a member, but not the owner or oneself', async () => {
    const { db, ws } = await withAmy();
    await expect(removeMember(db, { workspaceId: ws.id, userId: owner.userId, actor: 'amy', actorId: amy, actorRole: 'admin' })).rejects.toThrow(/擁有者不能/);
    await expect(removeMember(db, { workspaceId: ws.id, userId: owner.userId, ...asOwner })).rejects.toThrow(/自己/);
    await expect(removeMember(db, { workspaceId: ws.id, userId: amy, actor: 'x', actorId: ben, actorRole: 'editor' })).rejects.toThrow(MemberError);
    await removeMember(db, { workspaceId: ws.id, userId: amy, ...asOwner });
    expect((await listMembers(db, ws.id)).map((m) => m.email)).toEqual(['owner@example.com']);
    expect(await membershipFor(db, amy)).toBeNull();
  });
});
