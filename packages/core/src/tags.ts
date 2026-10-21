import { and, asc, eq, exists, inArray, notExists, or, sql, type SQL } from 'drizzle-orm';
import { postTags, posts, tags, type Db } from './db/index';

export class TagError extends Error {}

export const TAG_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'teal', 'gray'] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export type Tag = typeof tags.$inferSelect;

const NAME_MAX = 30;

/** The workspace's tags, by name. */
export function listTags(db: Db, workspaceId: string) {
  return db.select().from(tags).where(eq(tags.workspaceId, workspaceId)).orderBy(asc(tags.name));
}

/**
 * Add a tag, or return the existing one with the same name in any letter case, so the
 * composer can create a tag by typing it without making duplicates.
 *
 * Raises:
 *   TagError: the name is empty or too long, or the color is unknown.
 */
export async function createTag(db: Db, a: { workspaceId: string; name: string; color?: string }) {
  const name = a.name.trim();
  if (!name) throw new TagError('請輸入標籤名稱。');
  if (name.length > NAME_MAX) throw new TagError(`標籤名稱最多 ${NAME_MAX} 字。`);
  const color = a.color ?? 'blue';
  if (!(TAG_COLORS as readonly string[]).includes(color)) throw new TagError('沒有這個顏色。');
  const [made] = await db.insert(tags).values({ workspaceId: a.workspaceId, name, color: color as TagColor }).onConflictDoNothing().returning();
  if (made) return made;
  const [existing] = await db.select().from(tags).where(and(eq(tags.workspaceId, a.workspaceId), sql`lower(${tags.name}) = lower(${name})`));
  return existing!;
}

/** Delete a tag; its posts keep everything else. */
export async function deleteTag(db: Db, a: { workspaceId: string; id: string }) {
  await db.delete(tags).where(and(eq(tags.id, a.id), eq(tags.workspaceId, a.workspaceId)));
}

/**
 * Replace a post's tags. Called inside the post's own write, so a refused post leaves
 * its old tags.
 *
 * Raises:
 *   TagError: a tag is not in the post's workspace.
 */
export async function setPostTags(tx: Db, a: { workspaceId: string; postId: string; tagIds: string[] }) {
  const ids = [...new Set(a.tagIds)];
  if (ids.length) {
    const found = await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.workspaceId, a.workspaceId), inArray(tags.id, ids)));
    if (found.length !== ids.length) throw new TagError('有標籤不屬於這個工作區，請重新整理後再試。');
  }
  await tx.delete(postTags).where(eq(postTags.postId, a.postId));
  if (ids.length) await tx.insert(postTags).values(ids.map((tagId) => ({ postId: a.postId, tagId })));
}

/** Each post's tags, by name; posts without tags are absent. */
export async function tagsForPosts(db: Db, postIds: string[]) {
  const out = new Map<string, Tag[]>();
  if (!postIds.length) return out;
  const rows = await db.select({ postId: postTags.postId, tag: tags }).from(postTags).innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(inArray(postTags.postId, [...new Set(postIds)])).orderBy(asc(tags.name));
  for (const r of rows) out.set(r.postId, [...(out.get(r.postId) ?? []), r.tag]);
  return out;
}

/** Tag ids to filter by; null stands for posts with no tag, as Buffer's "Untagged". */
export type TagFilter = Array<string | null> | undefined;

/** A condition on `posts` keeping those with any of the tags, or with none when null is asked for. */
export function inTags(db: Db, tagIds: TagFilter): SQL | undefined {
  if (!tagIds?.length) return undefined;
  const ids = tagIds.filter((t): t is string => t !== null);
  const onPost = eq(postTags.postId, posts.id);
  return or(
    ids.length ? exists(db.select({ x: postTags.postId }).from(postTags).where(and(onPost, inArray(postTags.tagId, ids)))) : undefined,
    tagIds.includes(null) ? notExists(db.select({ x: postTags.postId }).from(postTags).where(onPost)) : undefined,
  );
}
