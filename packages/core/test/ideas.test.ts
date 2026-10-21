import { describe, expect, it } from 'vitest';
import { deleteIdea, getIdea, IdeaError, listIdeas, moveIdea, saveIdea } from '../src/ideas';
import { bootstrapWorkspace } from '../src/workspace';
import { testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  return { db, ws, who: { workspaceId: ws.id, actor: owner.email } };
}

describe('ideas', () => {
  it('starts unassigned, keeps edits trimmed, and lists the most recently touched first', async () => {
    const { db, ws, who } = await setup();
    const a = await saveIdea(db, { ...who, title: ' 雙十一倒數 ', body: ' 每天一張圖 ' });
    const b = await saveIdea(db, { ...who, title: '客戶故事', status: 'todo' });
    expect(a).toMatchObject({ title: '雙十一倒數', body: '每天一張圖', status: 'unassigned', createdBy: owner.email });
    await saveIdea(db, { ...who, id: a.id, title: '雙十一倒數（改）', status: 'todo' });
    const board = await listIdeas(db, ws.id);
    expect(board.todo.map((i) => i.title)).toEqual(['雙十一倒數（改）', '客戶故事']);
    expect(board.unassigned).toEqual([]);
    expect(b.status).toBe('todo');
  });

  it('moves between columns and deletes, only inside its own workspace', async () => {
    const { db, ws, who } = await setup();
    const other = await bootstrapWorkspace(db, { name: 'B', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } });
    const idea = await saveIdea(db, { ...who, title: '開箱影片' });
    await expect(moveIdea(db, { workspaceId: other.id, id: idea.id, status: 'done' })).rejects.toThrow(IdeaError);
    await moveIdea(db, { workspaceId: ws.id, id: idea.id, status: 'in_progress' });
    expect((await getIdea(db, { workspaceId: ws.id, id: idea.id }))?.status).toBe('in_progress');
    expect(await getIdea(db, { workspaceId: other.id, id: idea.id })).toBeNull();
    await deleteIdea(db, { workspaceId: other.id, id: idea.id });
    expect(await getIdea(db, { workspaceId: ws.id, id: idea.id })).not.toBeNull();
    await deleteIdea(db, { workspaceId: ws.id, id: idea.id });
    expect(await getIdea(db, { workspaceId: ws.id, id: idea.id })).toBeNull();
  });

  it('refuses an empty or long title, a long body and an unknown column', async () => {
    const { db, who } = await setup();
    await expect(saveIdea(db, { ...who, title: '  ' })).rejects.toThrow(/標題/);
    await expect(saveIdea(db, { ...who, title: 'x'.repeat(121) })).rejects.toThrow(/120/);
    await expect(saveIdea(db, { ...who, title: 'x', body: 'y'.repeat(5001) })).rejects.toThrow(/5000/);
    await expect(saveIdea(db, { ...who, title: 'x', status: 'archived' })).rejects.toThrow(/欄位/);
    await expect(saveIdea(db, { ...who, id: '00000000-0000-4000-8000-0000000000ff', title: 'x' })).rejects.toThrow(/找不到/);
  });
});
