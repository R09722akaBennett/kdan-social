import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { channelAccount, channelCounts, channelItems } from '../src/channel';
import { accountContext, encrypt } from '../src/crypto';
import { auditLog, connectedAccounts, postVariants, posts, publishTasks } from '../src/db/index';
import { ComposeError, createPost, listDrafts, saveDraft, updatePost } from '../src/posts';
import { bootstrapWorkspace } from '../src/workspace';
import { KEY, testDb } from './helpers';

const NOW = new Date('2026-10-20T08:00:00Z');
const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const IMG = [{ url: 'https://cdn.example.com/a.jpg' }];
const LATER = { mode: 'local' as const, date: '2026-10-25', time: '20:00' };

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN Mobile', owner });
  const add = async (platform: 'facebook' | 'instagram', externalId: string) => {
    const ref = { workspaceId: ws.id, platform, externalId };
    const [a] = await db.insert(connectedAccounts).values({
      ...ref, timeZone: 'Asia/Taipei', name: `${platform}-${externalId}`,
      credentials: encrypt('{"pageAccessToken":"t"}', KEY, accountContext(ref)),
    }).returning();
    return a!.id;
  };
  return { db, ws, fb: await add('facebook', 'f1'), ig: await add('instagram', 'i1') };
}

const asOwner = { actor: owner.email, role: 'owner' as const };
const asEditor = { actor: 'amy@example.com', role: 'editor' as const };

describe('drafts', () => {
  it('keeps a draft without tasks, even when it would break a platform rule', async () => {
    const { db, ws, fb, ig } = await setup();
    // Instagram needs an image to be scheduled, not to be drafted.
    const { postId } = await saveDraft(db, { workspaceId: ws.id, ...asOwner, body: '還在想\n第二行', accountIds: [fb, ig], media: [] });
    expect(await db.select().from(publishTasks)).toEqual([]);
    expect((await db.select().from(postVariants)).map((v) => v.reviewStatus)).toEqual(['draft', 'draft']);
    const [d] = await listDrafts(db, { workspaceId: ws.id });
    expect(d).toMatchObject({ post: { id: postId, title: '還在想' } });
    expect(d!.versions.map((v) => v.accountId).sort()).toEqual([fb, ig].sort());
    expect(await channelItems(db, { workspaceId: ws.id, accountId: ig, tab: 'drafts' })).toMatchObject([{ postId, runAt: null, status: 'draft' }]);
    expect(await channelItems(db, { workspaceId: ws.id, accountId: ig, tab: 'queue' })).toEqual([]);
    expect((await db.select().from(auditLog)).map((r) => r.action)).toContain('post.drafted');
  });

  it('replaces a draft’s accounts and text when saved again', async () => {
    const { db, ws, fb, ig } = await setup();
    const { postId } = await saveDraft(db, { workspaceId: ws.id, ...asOwner, body: 'v1', accountIds: [fb, ig], media: [] });
    await saveDraft(db, { workspaceId: ws.id, ...asOwner, postId, body: 'v2', perAccount: { [fb]: 'FB 版' }, accountIds: [fb], media: IMG });
    const versions = await db.select().from(postVariants);
    expect(versions.map((v) => [v.accountId, v.body])).toEqual([[fb, 'FB 版']]);
    expect(await listDrafts(db, { workspaceId: ws.id, accountId: ig })).toEqual([]);
  });

  it('becomes the scheduled post, keeping its id, once platform rules pass', async () => {
    const { db, ws, fb, ig } = await setup();
    const { postId } = await saveDraft(db, { workspaceId: ws.id, ...asOwner, body: '雙十一', accountIds: [fb, ig], media: [] });
    const schedule = { workspaceId: ws.id, ...asOwner, body: '雙十一', accountIds: [fb, ig], schedule: LATER, now: NOW, draftId: postId };
    await expect(createPost(db, { ...schedule, media: [] })).rejects.toThrow(/Instagram/);
    // The refused attempt leaves the draft as it was.
    expect(await listDrafts(db, { workspaceId: ws.id })).toHaveLength(1);

    const res = await createPost(db, { ...schedule, media: IMG });
    expect(res.postId).toBe(postId);
    expect(await listDrafts(db, { workspaceId: ws.id })).toEqual([]);
    expect(await db.select().from(publishTasks)).toHaveLength(2);
    expect(await channelItems(db, { workspaceId: ws.id, accountId: fb, tab: 'queue' })).toMatchObject([{ postId, status: 'scheduled', review: 'approved' }]);
  });

  it('refuses another editor’s draft, a scheduled post, and an edit through updatePost', async () => {
    const { db, ws, fb } = await setup();
    const { postId } = await saveDraft(db, { workspaceId: ws.id, ...asOwner, body: 'mine', accountIds: [fb], media: [] });
    await expect(saveDraft(db, { workspaceId: ws.id, ...asEditor, postId, body: 'x', accountIds: [fb], media: [] })).rejects.toThrow(ComposeError);
    await expect(updatePost(db, { workspaceId: ws.id, ...asOwner, postId, body: 'x', media: [], schedule: { mode: 'keep' } })).rejects.toThrow(/草稿/);

    const { postId: live } = await createPost(db, { workspaceId: ws.id, ...asOwner, body: 'live', accountIds: [fb], media: [], schedule: LATER, now: NOW });
    await expect(saveDraft(db, { workspaceId: ws.id, ...asOwner, postId: live, body: 'x', accountIds: [fb], media: [] })).rejects.toThrow(/已經排程/);
    expect(await db.select().from(publishTasks)).toHaveLength(1);
  });
});

describe('first comment', () => {
  it('is kept trimmed through a draft and its scheduling, and refused when too long', async () => {
    const { db, ws, fb } = await setup();
    const { postId } = await saveDraft(db, { workspaceId: ws.id, ...asOwner, body: 'x', firstComment: '  看留言  ', accountIds: [fb], media: [] });
    expect((await listDrafts(db, { workspaceId: ws.id }))[0]!.post.firstComment).toBe('看留言');
    await createPost(db, { workspaceId: ws.id, ...asOwner, body: 'x', firstComment: '看留言', accountIds: [fb], media: [], schedule: LATER, now: NOW, draftId: postId });
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(post!.firstComment).toBe('看留言');
    await expect(createPost(db, { workspaceId: ws.id, ...asOwner, body: 'y', firstComment: 'a'.repeat(2201), accountIds: [fb], media: [], schedule: LATER, now: NOW })).rejects.toThrow(/2200/);
    await createPost(db, { workspaceId: ws.id, ...asOwner, body: 'z', firstComment: '   ', accountIds: [fb], media: [], schedule: LATER, now: NOW });
    expect((await db.select().from(posts)).find((p) => p.body === 'z')!.firstComment).toBeNull();
  });
});

describe('channel tabs', () => {
  it('splits one account’s posts into queue, approvals, sent and drafts', async () => {
    const { db, ws, fb, ig } = await setup();
    const post = (body: string, who: typeof asOwner | typeof asEditor) =>
      createPost(db, { workspaceId: ws.id, ...who, body, accountIds: [fb], media: [], schedule: LATER, now: NOW });
    await post('approved one', asOwner);
    await post('waits for review', asEditor);
    const { postId: sentId } = await post('already out', asOwner);
    const { postId: cancelled } = await post('withdrawn', asOwner);
    const variantOf = async (postId: string) => (await db.select().from(postVariants).where(eq(postVariants.postId, postId)))[0]!.id;
    await db.update(publishTasks).set({ status: 'published', externalPostId: 'fb_1' }).where(eq(publishTasks.variantId, await variantOf(sentId)));
    await db.update(publishTasks).set({ status: 'cancelled' }).where(eq(publishTasks.variantId, await variantOf(cancelled)));
    await saveDraft(db, { workspaceId: ws.id, ...asOwner, body: 'idea', accountIds: [fb], media: [] });

    expect(await channelCounts(db, { workspaceId: ws.id, accountId: fb })).toEqual({ queue: 1, approvals: 1, sent: 1, drafts: 1 });
    expect((await channelItems(db, { workspaceId: ws.id, accountId: fb, tab: 'approvals' })).map((i) => i.title)).toEqual(['waits for review']);
    expect(await channelItems(db, { workspaceId: ws.id, accountId: fb, tab: 'sent' })).toMatchObject([{ title: 'already out', externalPostId: 'fb_1' }]);
    expect(await channelCounts(db, { workspaceId: ws.id, accountId: ig })).toEqual({ queue: 0, approvals: 0, sent: 0, drafts: 0 });
  });

  it('finds an account only inside its own workspace', async () => {
    const { db, ws, fb } = await setup();
    const other = await bootstrapWorkspace(db, { name: 'Other', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } });
    expect(await channelAccount(db, { workspaceId: ws.id, accountId: fb })).toMatchObject({ id: fb });
    expect(await channelAccount(db, { workspaceId: other.id, accountId: fb })).toBeNull();
    expect(await channelAccount(db, { workspaceId: ws.id, accountId: 'not-a-uuid' })).toBeNull();
  });
});
