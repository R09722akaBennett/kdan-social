import { and, eq, inArray, ne } from 'drizzle-orm';
import { accountGroups, auditLog, connectedAccounts, workspaces, type Db } from './db/index';
import { assertTimeZone } from './time';

/** A group or account-settings change refused; the message is shown to the user as is. */
export class GroupError extends Error {}

type Role = 'owner' | 'admin' | 'editor' | 'reviewer';
const NAME_MAX = 40;

function requireManager(role: Role) {
  if (role !== 'owner' && role !== 'admin') throw new GroupError('只有擁有者或管理員可以調整帳號與群組。');
}

export function listGroups(db: Db, workspaceId: string) {
  return db.select().from(accountGroups).where(eq(accountGroups.workspaceId, workspaceId)).orderBy(accountGroups.createdAt);
}

/** The zone the workspace is shown in, which new accounts start with. */
export async function workspaceTimeZone(db: Db, workspaceId: string): Promise<string> {
  const [ws] = await db.select({ timeZone: workspaces.timeZone }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return ws?.timeZone ?? 'Asia/Taipei';
}

/**
 * Create a group, or rename an existing one, and make `accountIds` exactly its accounts.
 *
 * An account is in at most one group, so listed accounts leave whatever group they were
 * in, and accounts that were in this group but are not listed become ungrouped.
 *
 * Returns:
 *   The group's id.
 *
 * Raises:
 *   GroupError: the caller may not manage groups, the name is empty, too long or taken,
 *     or the group or an account is not in the workspace.
 */
export async function saveGroup(db: Db, a: { workspaceId: string; groupId?: string; name: string; accountIds: string[]; actor: string; role: Role }): Promise<string> {
  requireManager(a.role);
  const name = a.name.trim();
  if (!name) throw new GroupError('請幫群組取個名字。');
  if (name.length > NAME_MAX) throw new GroupError(`群組名稱最多 ${NAME_MAX} 個字。`);

  return db.transaction(async (tx) => {
    const taken = await tx.select({ id: accountGroups.id }).from(accountGroups)
      .where(and(eq(accountGroups.workspaceId, a.workspaceId), eq(accountGroups.name, name), a.groupId ? ne(accountGroups.id, a.groupId) : undefined));
    if (taken.length) throw new GroupError(`已經有叫「${name}」的群組了。`);

    const ids = [...new Set(a.accountIds)];
    if (ids.length) {
      const found = await tx.select({ id: connectedAccounts.id }).from(connectedAccounts)
        .where(and(eq(connectedAccounts.workspaceId, a.workspaceId), inArray(connectedAccounts.id, ids)));
      if (found.length !== ids.length) throw new GroupError('有帳號不屬於這個工作區，請重新整理後再試。');
    }

    let groupId = a.groupId;
    if (groupId) {
      const updated = await tx.update(accountGroups).set({ name })
        .where(and(eq(accountGroups.id, groupId), eq(accountGroups.workspaceId, a.workspaceId))).returning();
      if (!updated.length) throw new GroupError('找不到這個群組，請重新整理後再試。');
      await tx.update(connectedAccounts).set({ groupId: null }).where(eq(connectedAccounts.groupId, groupId));
    } else {
      const [g] = await tx.insert(accountGroups).values({ workspaceId: a.workspaceId, name }).returning();
      groupId = g!.id;
    }
    if (ids.length) await tx.update(connectedAccounts).set({ groupId }).where(inArray(connectedAccounts.id, ids));
    await tx.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: a.groupId ? 'group.updated' : 'group.created', target: groupId, detail: { name, accounts: ids.length } });
    return groupId;
  });
}

/**
 * Delete a group; its accounts stay connected and become ungrouped.
 *
 * Raises:
 *   GroupError: the caller may not manage groups, or the group is not in the workspace.
 */
export async function deleteGroup(db: Db, a: { workspaceId: string; groupId: string; actor: string; role: Role }) {
  requireManager(a.role);
  const [g] = await db.delete(accountGroups).where(and(eq(accountGroups.id, a.groupId), eq(accountGroups.workspaceId, a.workspaceId))).returning();
  if (!g) throw new GroupError('找不到這個群組，請重新整理後再試。');
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'group.deleted', target: g.id, detail: { name: g.name } });
}

/**
 * Set the clock an account's "local time" posts run on. Tasks already scheduled keep their time.
 *
 * Raises:
 *   GroupError: the caller may not manage accounts, the zone is unknown, or the account
 *     is not in the workspace.
 */
export async function setAccountTimeZone(db: Db, a: { workspaceId: string; accountId: string; timeZone: string; actor: string; role: Role }) {
  requireManager(a.role);
  try {
    assertTimeZone(a.timeZone);
  } catch {
    throw new GroupError('不認得這個時區。');
  }
  const [acc] = await db.update(connectedAccounts).set({ timeZone: a.timeZone })
    .where(and(eq(connectedAccounts.id, a.accountId), eq(connectedAccounts.workspaceId, a.workspaceId))).returning({ name: connectedAccounts.name });
  if (!acc) throw new GroupError('找不到這個帳號，請重新整理後再試。');
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'account.time_zone', target: a.accountId, detail: { name: acc.name, timeZone: a.timeZone } });
}
