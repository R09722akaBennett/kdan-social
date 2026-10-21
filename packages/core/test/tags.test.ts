import { describe, expect, it } from 'vitest';
import { channelItems } from '../src/channel';
import { accountContext, encrypt } from '../src/crypto';
import { connectedAccounts } from '../src/db/index';
import { tasksBetween } from '../src/overview';
import { createPost, listDrafts, saveDraft, updatePost } from '../src/posts';
import { createTag, deleteTag, listTags, tagsForPosts, TagError } from '../src/tags';
import { bootstrapWorkspace } from '../src/workspace';
import { KEY, testDb } from './helpers';

const NOW = new Date('2026-10-20T08:00:00Z');
const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const LATER = { mode: 'local' as const, date: '2026-10-25', time: '20:00' };
const WEEK = { from: new Date('2026-10-20T00:00:00Z'), to: new Date('2026-10-30T00:00:00Z') };

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const ref = { workspaceId: ws.id, platform: 'facebook' as const, externalId: 'f1' };
  const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Taipei', name: 'FB', credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)) }).returning();
  const post = (body: string, tagIds?: string[]) => createPost(db, { workspaceId: ws.id, actor: owner.email, role: 'owner', body, accountIds: [a!.id], media: [], schedule: LATER, now: NOW, tagIds });
  return { db, ws, accountId: a!.id, post };
}

describe('tags', () => {
  it('reuses a tag of the same name in any case and refuses bad names and colors', async () => {
    const { db, ws } = await setup();
    const t = await createTag(db, { workspaceId: ws.id, name: ' 促銷 ', color: 'orange' });
    expect(t).toMatchObject({ name: '促銷', color: 'orange' });
    expect((await createTag(db, { workspaceId: ws.id, name: 'Sale' })).id).not.toBe(t.id);
    expect((await createTag(db, { workspaceId: ws.id, name: 'SALE' })).name).toBe('Sale');
    expect((await listTags(db, ws.id)).map((x) => x.name)).toEqual(['Sale', '促銷']);
    await expect(createTag(db, { workspaceId: ws.id, name: '  ' })).rejects.toThrow(TagError);
    await expect(createTag(db, { workspaceId: ws.id, name: 'x'.repeat(31) })).rejects.toThrow(/30/);
    await expect(createTag(db, { workspaceId: ws.id, name: 'x', color: 'gold' })).rejects.toThrow(/顏色/);
  });

  it('keeps tags through saves, refuses another workspace’s, and filters by tag or untagged', async () => {
    const { db, ws, accountId, post } = await setup();
    const sale = await createTag(db, { workspaceId: ws.id, name: '促銷' });
    const story = await createTag(db, { workspaceId: ws.id, name: '故事' });
    const other = await bootstrapWorkspace(db, { name: 'B', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } });
    const foreign = await createTag(db, { workspaceId: other.id, name: '別人的' });

    const { postId: a } = await post('一', [sale.id, story.id]);
    const { postId: b } = await post('二');
    await expect(post('三', [foreign.id])).rejects.toThrow(TagError);
    expect((await tasksBetween(db, { workspaceId: ws.id, ...WEEK })).map((t) => t.title)).toEqual(['一', '二']);

    // Editing without tagIds keeps them; with an array replaces them.
    await updatePost(db, { workspaceId: ws.id, actor: owner.email, role: 'owner', postId: a, body: '一（改）', media: [], schedule: { mode: 'keep' } });
    expect((await tagsForPosts(db, [a, b])).get(a)!.map((t) => t.name)).toEqual(['促銷', '故事']);
    await updatePost(db, { workspaceId: ws.id, actor: owner.email, role: 'owner', postId: a, body: '一（改）', media: [], schedule: { mode: 'keep' }, tagIds: [story.id] });
    expect((await tagsForPosts(db, [a])).get(a)!.map((t) => t.name)).toEqual(['故事']);

    expect((await tasksBetween(db, { workspaceId: ws.id, ...WEEK, tagIds: [sale.id] }))).toEqual([]);
    expect((await tasksBetween(db, { workspaceId: ws.id, ...WEEK, tagIds: [story.id] })).map((t) => t.postId)).toEqual([a]);
    expect((await tasksBetween(db, { workspaceId: ws.id, ...WEEK, tagIds: [null] })).map((t) => t.postId)).toEqual([b]);
    expect((await channelItems(db, { workspaceId: ws.id, accountId, tab: 'queue', tagIds: [null, story.id] })).length).toBe(2);

    const { postId: d } = await saveDraft(db, { workspaceId: ws.id, actor: owner.email, role: 'owner', body: '草稿', accountIds: [accountId], media: [], tagIds: [sale.id] });
    expect((await listDrafts(db, { workspaceId: ws.id, tagIds: [sale.id] })).map((x) => x.post.id)).toEqual([d]);
    expect(await listDrafts(db, { workspaceId: ws.id, tagIds: [null] })).toEqual([]);

    await deleteTag(db, { workspaceId: ws.id, id: story.id });
    expect((await tagsForPosts(db, [a])).get(a)).toBeUndefined();
    expect((await tasksBetween(db, { workspaceId: ws.id, ...WEEK })).length).toBe(2);
  });
});
