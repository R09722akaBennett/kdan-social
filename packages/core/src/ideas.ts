import { and, desc, eq } from 'drizzle-orm';
import { ideas, type Db } from './db/index';

export class IdeaError extends Error {}

export const IDEA_STATUSES = ['unassigned', 'todo', 'in_progress', 'done'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export type Idea = typeof ideas.$inferSelect;

const TITLE_MAX = 120;
const BODY_MAX = 5000;

/** Every idea in the workspace, by column, the most recently touched first. */
export async function listIdeas(db: Db, workspaceId: string): Promise<Record<IdeaStatus, Idea[]>> {
  const rows = await db.select().from(ideas).where(eq(ideas.workspaceId, workspaceId)).orderBy(desc(ideas.updatedAt));
  const board = Object.fromEntries(IDEA_STATUSES.map((s) => [s, [] as Idea[]])) as Record<IdeaStatus, Idea[]>;
  for (const r of rows) board[r.status].push(r);
  return board;
}

/** One idea, or null when it is not in the workspace. */
export async function getIdea(db: Db, a: { workspaceId: string; id: string }) {
  if (!/^[0-9a-f-]{36}$/.test(a.id)) return null;
  const [row] = await db.select().from(ideas).where(and(eq(ideas.id, a.id), eq(ideas.workspaceId, a.workspaceId)));
  return row ?? null;
}

/**
 * Add an idea, or change one when `id` is given. Anyone in the workspace may, since the
 * board is shared scratch space and nothing on it is published.
 *
 * Raises:
 *   IdeaError: the title is empty or too long, the body is too long, the column is
 *     unknown, or `id` is not an idea in the workspace.
 */
export async function saveIdea(db: Db, a: { workspaceId: string; actor: string; id?: string; title: string; body?: string; status?: string }) {
  const title = a.title.trim();
  const body = (a.body ?? '').trim();
  if (!title) throw new IdeaError('請幫點子取個標題。');
  if (title.length > TITLE_MAX) throw new IdeaError(`標題最多 ${TITLE_MAX} 字。`);
  if (body.length > BODY_MAX) throw new IdeaError(`內容最多 ${BODY_MAX} 字。`);
  const status = a.status ?? 'unassigned';
  if (!(IDEA_STATUSES as readonly string[]).includes(status)) throw new IdeaError('看板上沒有這個欄位。');
  const values = { title, body, status: status as IdeaStatus, updatedAt: new Date() };
  if (!a.id) {
    const [row] = await db.insert(ideas).values({ workspaceId: a.workspaceId, createdBy: a.actor, ...values }).returning();
    return row!;
  }
  const [row] = await db.update(ideas).set(values).where(and(eq(ideas.id, a.id), eq(ideas.workspaceId, a.workspaceId))).returning();
  if (!row) throw new IdeaError('找不到這個點子，請重新整理後再試。');
  return row;
}

/**
 * Move an idea to another column; it goes to the top of it.
 *
 * Raises:
 *   IdeaError: the column is unknown or the idea is not in the workspace.
 */
export async function moveIdea(db: Db, a: { workspaceId: string; id: string; status: string }) {
  if (!(IDEA_STATUSES as readonly string[]).includes(a.status)) throw new IdeaError('看板上沒有這個欄位。');
  const [row] = await db.update(ideas).set({ status: a.status as IdeaStatus, updatedAt: new Date() })
    .where(and(eq(ideas.id, a.id), eq(ideas.workspaceId, a.workspaceId))).returning();
  if (!row) throw new IdeaError('找不到這個點子，請重新整理後再試。');
  return row;
}

/** Delete an idea; deleting one that is already gone is not an error. */
export async function deleteIdea(db: Db, a: { workspaceId: string; id: string }) {
  await db.delete(ideas).where(and(eq(ideas.id, a.id), eq(ideas.workspaceId, a.workspaceId)));
}
