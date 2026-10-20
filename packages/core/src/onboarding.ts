import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { accountGroups, auditLog, brandVoices, connectedAccounts, postVariants, posts, publishTasks, workspaceInvites, workspaceMembers, workspaces, type Db } from './db/index';
import { assertTimeZone } from './time';
import { bootstrapWorkspace, membershipFor } from './workspace';

/** A workspace change refused; the message is shown to the user as is. */
export class WorkspaceError extends Error {}

type Role = 'owner' | 'admin' | 'editor' | 'reviewer';
const NAME_MAX = 60;

function checkName(raw: string) {
  const name = raw.trim();
  if (!name) throw new WorkspaceError('請幫工作區取個名字。');
  if (name.length > NAME_MAX) throw new WorkspaceError(`工作區名稱最多 ${NAME_MAX} 個字。`);
  return name;
}

function checkZone(tz: string) {
  try {
    assertTimeZone(tz);
  } catch {
    throw new WorkspaceError('不認得這個時區。');
  }
}

/**
 * Let a signed-in person without a workspace create one and become its owner.
 *
 * Args:
 *   codes: the signup codes this deployment accepts; empty means self-serve signup is off.
 *
 * Raises:
 *   WorkspaceError: signup is off, the code is wrong, the person already has a
 *     workspace, or the name or time zone is invalid.
 */
export async function createWorkspaceForUser(db: Db, a: { userId: string; email: string; name: string; timeZone: string; code: string; codes: string[] }) {
  if (a.codes.length === 0) throw new WorkspaceError('目前不開放自行建立工作區，請聯絡我們取得邀請。');
  if (!a.codes.includes(a.code.trim())) throw new WorkspaceError('邀請碼不正確。');
  if (await membershipFor(db, a.userId)) throw new WorkspaceError('你已經有工作區了。');
  const name = checkName(a.name);
  checkZone(a.timeZone);
  return bootstrapWorkspace(db, { name, owner: { userId: a.userId, email: a.email }, timeZone: a.timeZone });
}

/**
 * Change the workspace's name, display time zone or review rule.
 *
 * The time zone is what pages show times in and what new accounts start with; accounts
 * already connected keep their own.
 *
 * Raises:
 *   WorkspaceError: the caller is neither an owner nor an admin, or a value is invalid.
 */
export async function updateWorkspaceSettings(db: Db, a: { workspaceId: string; name?: string; timeZone?: string; requiresReview?: boolean; actor: string; role: Role }) {
  if (a.role !== 'owner' && a.role !== 'admin') throw new WorkspaceError('只有擁有者或管理員可以修改設定。');
  const set: Partial<typeof workspaces.$inferInsert> = {};
  if (a.name !== undefined) set.name = checkName(a.name);
  if (a.timeZone !== undefined) { checkZone(a.timeZone); set.timeZone = a.timeZone; }
  if (a.requiresReview !== undefined) set.requiresReview = a.requiresReview;
  if (Object.keys(set).length === 0) return;
  await db.update(workspaces).set(set).where(eq(workspaces.id, a.workspaceId));
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'workspace.updated', target: a.workspaceId, detail: set as Record<string, unknown> });
}

/** Hide the setup checklist for everyone in the workspace. */
export async function dismissOnboarding(db: Db, a: { workspaceId: string; actor: string }) {
  await db.update(workspaces).set({ onboardingDismissedAt: new Date() }).where(eq(workspaces.id, a.workspaceId));
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'onboarding.dismissed', target: a.workspaceId });
}

export type SetupProgress = {
  accounts: boolean;
  groups: boolean;
  voice: boolean;
  members: boolean;
  testRun: boolean;
  publishing: boolean;
  dismissed: boolean;
};

/** Which setup steps are done, read from what the workspace already has, so nothing extra is tracked. */
export async function setupProgress(db: Db, workspaceId: string): Promise<SetupProgress> {
  const count = async (q: Promise<Array<{ n: number }>>) => ((await q)[0]?.n ?? 0) > 0;
  const n = sql<number>`count(*)::int`;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const [accounts, groups, voice, members, invites, runs] = await Promise.all([
    count(db.select({ n }).from(connectedAccounts).where(eq(connectedAccounts.workspaceId, workspaceId))),
    count(db.select({ n }).from(accountGroups).where(eq(accountGroups.workspaceId, workspaceId))),
    count(db.select({ n }).from(brandVoices).where(eq(brandVoices.workspaceId, workspaceId))),
    db.select({ n }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).then((r) => (r[0]?.n ?? 0) > 1),
    count(db.select({ n }).from(workspaceInvites).where(eq(workspaceInvites.workspaceId, workspaceId))),
    count(db.select({ n }).from(publishTasks).innerJoin(postVariants, eq(postVariants.id, publishTasks.variantId)).innerJoin(posts, eq(posts.id, postVariants.postId))
      .where(and(eq(posts.workspaceId, workspaceId), inArray(publishTasks.status, ['dry_run', 'published'])))),
  ]);
  return { accounts, groups, voice, members: members || invites, testRun: runs, publishing: !!ws?.publishingEnabled, dismissed: !!ws?.onboardingDismissedAt };
}

/** AI requests in the last `days`, per model, from the usage log. */
export async function aiUsage(db: Db, a: { workspaceId: string; days: number; now?: Date }) {
  const since = new Date((a.now ?? new Date()).getTime() - a.days * 86_400_000);
  const rows = await db.select({ detail: auditLog.detail }).from(auditLog)
    .where(and(eq(auditLog.workspaceId, a.workspaceId), eq(auditLog.action, 'ai.used'), gt(auditLog.at, since)));
  const byModel = new Map<string, { requests: number; input: number; output: number }>();
  for (const { detail } of rows) {
    const d = (detail ?? {}) as { model?: string | null; input?: number; output?: number };
    const key = d.model ?? '（未記錄）';
    const m = byModel.get(key) ?? { requests: 0, input: 0, output: 0 };
    m.requests++;
    m.input += d.input ?? 0;
    m.output += d.output ?? 0;
    byModel.set(key, m);
  }
  return [...byModel].map(([model, m]) => ({ model, ...m })).sort((x, y) => y.requests - x.requests);
}
