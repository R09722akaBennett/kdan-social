import { and, asc, eq } from 'drizzle-orm';
import { auditLog, workspaceInvites, workspaceMembers, workspaces, type Db } from './db/index';

/** A member change refused; the message is shown to the user as is. */
export class MemberError extends Error {}

type Role = 'owner' | 'admin' | 'editor' | 'reviewer';
/** Roles that can be given from the members page; there is one owner, set at creation. */
export type AssignableRole = 'admin' | 'editor';
const ASSIGNABLE: AssignableRole[] = ['admin', 'editor'];
// Deliberately loose: the sign-in link is the real check that the address works.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const canManageMembers = (role: Role) => role === 'owner' || role === 'admin';

function requireManager(role: Role) {
  if (!canManageMembers(role)) throw new MemberError('只有擁有者或管理員可以管理成員。');
}

function assignable(role: string): AssignableRole {
  if (!ASSIGNABLE.includes(role as AssignableRole)) throw new MemberError('不認得這個角色。');
  return role as AssignableRole;
}

export function listMembers(db: Db, workspaceId: string) {
  return db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(asc(workspaceMembers.createdAt));
}

export function listInvites(db: Db, workspaceId: string) {
  return db.select().from(workspaceInvites).where(eq(workspaceInvites.workspaceId, workspaceId)).orderBy(asc(workspaceInvites.createdAt));
}

/**
 * Invite someone by email; they join when they first sign in with it. Inviting an
 * address again changes the pending invite's role.
 *
 * Raises:
 *   MemberError: the caller may not manage members, the email or role is invalid,
 *     or the address already belongs to a member.
 */
export async function inviteMember(db: Db, a: { workspaceId: string; email: string; role: string; actor: string; actorRole: Role }) {
  requireManager(a.actorRole);
  const email = a.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new MemberError('Email 格式不正確。');
  const role = assignable(a.role);
  const [member] = await db.select({ email: workspaceMembers.email }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, a.workspaceId), eq(workspaceMembers.email, email)));
  if (member) throw new MemberError(`${email} 已經是成員了。`);
  await db.insert(workspaceInvites).values({ workspaceId: a.workspaceId, email, role, invitedBy: a.actor })
    .onConflictDoUpdate({ target: [workspaceInvites.workspaceId, workspaceInvites.email], set: { role, invitedBy: a.actor } });
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'member.invited', target: email, detail: { role } });
  return { email };
}

/**
 * Withdraw a pending invite.
 *
 * Raises:
 *   MemberError: the caller may not manage members, or the invite is not in the workspace.
 */
export async function revokeInvite(db: Db, a: { workspaceId: string; inviteId: string; actor: string; actorRole: Role }) {
  requireManager(a.actorRole);
  const [inv] = await db.delete(workspaceInvites).where(and(eq(workspaceInvites.id, a.inviteId), eq(workspaceInvites.workspaceId, a.workspaceId))).returning();
  if (!inv) throw new MemberError('找不到這個邀請，請重新整理後再試。');
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'member.invite_revoked', target: inv.email });
}

async function memberOf(db: Db, workspaceId: string, userId: string) {
  const [m] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  if (!m) throw new MemberError('找不到這位成員，請重新整理後再試。');
  return m;
}

/**
 * Change a member's role. The owner's role is fixed, and nobody changes their own.
 *
 * Raises:
 *   MemberError: the caller may not manage members, the role is invalid, or the
 *     target is the owner, the caller, or not a member.
 */
export async function changeRole(db: Db, a: { workspaceId: string; userId: string; role: string; actor: string; actorId: string; actorRole: Role }) {
  requireManager(a.actorRole);
  const role = assignable(a.role);
  if (a.userId === a.actorId) throw new MemberError('不能改自己的角色。');
  const m = await memberOf(db, a.workspaceId, a.userId);
  if (m.role === 'owner') throw new MemberError('擁有者的角色不能更改。');
  await db.update(workspaceMembers).set({ role }).where(and(eq(workspaceMembers.workspaceId, a.workspaceId), eq(workspaceMembers.userId, a.userId)));
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'member.role_changed', target: m.email, detail: { from: m.role, to: role } });
}

/**
 * Remove a member from the workspace. Their posts and history stay.
 *
 * Raises:
 *   MemberError: the caller may not manage members, or the target is the owner,
 *     the caller, or not a member.
 */
export async function removeMember(db: Db, a: { workspaceId: string; userId: string; actor: string; actorId: string; actorRole: Role }) {
  requireManager(a.actorRole);
  if (a.userId === a.actorId) throw new MemberError('不能移除自己。');
  const m = await memberOf(db, a.workspaceId, a.userId);
  if (m.role === 'owner') throw new MemberError('擁有者不能被移除。');
  await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, a.workspaceId), eq(workspaceMembers.userId, a.userId)));
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'member.removed', target: m.email, detail: { role: m.role } });
}

/**
 * Turn the pending invite for a signed-in user's email into a membership.
 *
 * Call it only with an email the auth provider has verified; the invite trusts it.
 *
 * Returns:
 *   The joined workspace and role, or null when no invite waits for this email.
 */
export async function acceptInvite(db: Db, a: { userId: string; email: string }) {
  const email = a.email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(workspaceInvites).where(eq(workspaceInvites.email, email)).orderBy(asc(workspaceInvites.createdAt)).limit(1);
    if (!inv) return null;
    await tx.insert(workspaceMembers).values({ workspaceId: inv.workspaceId, userId: a.userId, email, role: inv.role }).onConflictDoNothing();
    await tx.delete(workspaceInvites).where(eq(workspaceInvites.id, inv.id));
    await tx.insert(auditLog).values({ workspaceId: inv.workspaceId, actor: email, action: 'member.joined', target: email, detail: { role: inv.role, invitedBy: inv.invitedBy } });
    const [ws] = await tx.select().from(workspaces).where(eq(workspaces.id, inv.workspaceId));
    return { workspace: ws!, role: inv.role };
  });
}
