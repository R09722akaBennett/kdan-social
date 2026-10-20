import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { auditLog, connectedAccounts, type Db } from '../src/db/index';
import { deleteGroup, GroupError, listGroups, saveGroup, setAccountTimeZone } from '../src/groups';
import { bootstrapWorkspace, listAccounts } from '../src/workspace';
import { KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const by = { actor: owner.email, role: 'owner' as const };

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const add = async (d: Db, workspaceId: string, externalId: string) => {
    const ref = { workspaceId, platform: 'facebook' as const, externalId };
    const [a] = await d.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: externalId, credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
    return a!.id;
  };
  const [a, b, c] = [await add(db, ws.id, 'a'), await add(db, ws.id, 'b'), await add(db, ws.id, 'c')];
  return { db, ws, a, b, c, add };
}

const groupOf = async (db: Db, wsId: string) => Object.fromEntries((await listAccounts(db, wsId)).map((x) => [x.name, x.groupId]));

describe('saveGroup', () => {
  it('creates a group holding exactly the chosen accounts', async () => {
    const { db, ws, a, b } = await setup();
    const g = await saveGroup(db, { workspaceId: ws.id, name: ' 台灣 ', accountIds: [a, b], ...by });
    expect((await listGroups(db, ws.id)).map((x) => x.name)).toEqual(['台灣']);
    expect(await groupOf(db, ws.id)).toEqual({ a: g, b: g, c: null });
    expect((await db.select().from(auditLog)).map((r) => r.action)).toContain('group.created');
  });

  it('moves an account out of its old group, and drops accounts left off an edit', async () => {
    const { db, ws, a, b, c } = await setup();
    const tw = await saveGroup(db, { workspaceId: ws.id, name: '台灣', accountIds: [a, b], ...by });
    const sub = await saveGroup(db, { workspaceId: ws.id, name: '子品牌 A', accountIds: [b, c], ...by });
    expect(await groupOf(db, ws.id)).toEqual({ a: tw, b: sub, c: sub });
    await saveGroup(db, { workspaceId: ws.id, groupId: sub, name: '子品牌 B', accountIds: [c], ...by });
    expect(await groupOf(db, ws.id)).toEqual({ a: tw, b: null, c: sub });
    expect((await listGroups(db, ws.id)).map((x) => x.name)).toEqual(['台灣', '子品牌 B']);
  });

  it('refuses bad names, foreign accounts and groups, and non-managers', async () => {
    const { db, ws, a, add } = await setup();
    await saveGroup(db, { workspaceId: ws.id, name: '台灣', accountIds: [], ...by });
    const other = await bootstrapWorkspace(db, { name: 'Other', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'x@example.com' } });
    const foreign = await add(db, other.id, 'z');
    const foreignGroup = await saveGroup(db, { workspaceId: other.id, name: 'X', accountIds: [], ...by });
    const tries: Array<[Partial<Parameters<typeof saveGroup>[1]>, RegExp]> = [
      [{ name: '  ' }, /取個名字/],
      [{ name: 'x'.repeat(41) }, /最多 40/],
      [{ name: '台灣' }, /已經有叫「台灣」/],
      [{ accountIds: [a, foreign] }, /不屬於這個工作區/],
      [{ groupId: foreignGroup }, /找不到這個群組/],
      [{ role: 'editor' }, /擁有者或管理員/],
    ];
    for (const [patch, msg] of tries) {
      await expect(saveGroup(db, { workspaceId: ws.id, name: '新群組', accountIds: [a], ...by, ...patch })).rejects.toThrow(msg);
    }
    expect((await groupOf(db, ws.id)).a).toBeNull();
    expect((await groupOf(db, other.id)).z).toBeNull();
  });
});

describe('deleteGroup', () => {
  it('ungroups the accounts and keeps them connected', async () => {
    const { db, ws, a } = await setup();
    const g = await saveGroup(db, { workspaceId: ws.id, name: '台灣', accountIds: [a], ...by });
    await expect(deleteGroup(db, { workspaceId: ws.id, groupId: g, actor: 'x', role: 'reviewer' })).rejects.toThrow(GroupError);
    await deleteGroup(db, { workspaceId: ws.id, groupId: g, ...by });
    expect(await listGroups(db, ws.id)).toEqual([]);
    expect(await groupOf(db, ws.id)).toEqual({ a: null, b: null, c: null });
    await expect(deleteGroup(db, { workspaceId: ws.id, groupId: g, ...by })).rejects.toThrow(/找不到/);
  });
});

describe('setAccountTimeZone', () => {
  it('sets a known zone and refuses an unknown one', async () => {
    const { db, ws, a } = await setup();
    await setAccountTimeZone(db, { workspaceId: ws.id, accountId: a, timeZone: 'America/New_York', ...by });
    const [row] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, a));
    expect(row!.timeZone).toBe('America/New_York');
    await expect(setAccountTimeZone(db, { workspaceId: ws.id, accountId: a, timeZone: 'Mars/Olympus', ...by })).rejects.toThrow(/不認得/);
    await expect(setAccountTimeZone(db, { workspaceId: ws.id, accountId: '00000000-0000-4000-8000-0000000000ff', timeZone: 'Asia/Tokyo', ...by })).rejects.toThrow(/找不到/);
  });
});
