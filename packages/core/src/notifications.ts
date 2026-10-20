import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { notifications, workspaceMembers, type Db } from './db/index';

export type NotificationKind =
  | 'publish.failed'
  | 'publish.needs_check'
  | 'publish.missed'
  | 'account.expired'
  | 'review.requested'
  | 'review.approved'
  | 'review.changes_requested'
  | 'post.commented';

export type NotifyInput = {
  workspaceId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  /** Members to tell, by email; emails of people no longer in the workspace are ignored. */
  emails?: Array<string | null | undefined>;
  /** Also tell every owner and admin. */
  managers?: boolean;
  /** Whoever caused the event; they are never told about their own action. */
  actor?: string;
};

/**
 * Leave a notification for each recipient that is still a member.
 *
 * Returns:
 *   How many notifications were written; 0 when nobody is left to tell.
 */
export async function notify(db: Db, a: NotifyInput): Promise<number> {
  const emails = [...new Set((a.emails ?? []).filter((e): e is string => !!e))];
  if (emails.length === 0 && !a.managers) return 0;
  const who = [
    ...(emails.length ? [inArray(workspaceMembers.email, emails)] : []),
    ...(a.managers ? [inArray(workspaceMembers.role, ['owner', 'admin'])] : []),
  ];
  const members = await db.select({ userId: workspaceMembers.userId, email: workspaceMembers.email }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, a.workspaceId), or(...who)));
  const to = members.filter((m) => m.email !== a.actor);
  if (to.length === 0) return 0;
  await db.insert(notifications).values(to.map((m) => ({
    workspaceId: a.workspaceId, userId: m.userId, kind: a.kind, title: a.title, body: a.body ?? null, href: a.href ?? null,
  })));
  return to.length;
}

/** A member's notifications in a workspace, newest first. */
export function listNotifications(db: Db, a: { workspaceId: string; userId: string; unreadOnly?: boolean; limit?: number }) {
  return db.select().from(notifications)
    .where(and(eq(notifications.workspaceId, a.workspaceId), eq(notifications.userId, a.userId), a.unreadOnly ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.createdAt))
    .limit(a.limit ?? 50);
}

export async function unreadCount(db: Db, a: { workspaceId: string; userId: string }): Promise<number> {
  const [row] = await db.select({ n: count() }).from(notifications)
    .where(and(eq(notifications.workspaceId, a.workspaceId), eq(notifications.userId, a.userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/**
 * Mark one notification read, or all of them when `id` is omitted.
 *
 * Returns:
 *   The link of the notification marked, so the caller can open it; null when
 *   marking all, or when the id is not this member's.
 */
export async function markRead(db: Db, a: { workspaceId: string; userId: string; id?: string; now?: Date }): Promise<string | null> {
  const rows = await db.update(notifications).set({ readAt: a.now ?? new Date() })
    .where(and(
      eq(notifications.workspaceId, a.workspaceId), eq(notifications.userId, a.userId), isNull(notifications.readAt),
      a.id ? eq(notifications.id, a.id) : undefined,
    ))
    .returning({ href: notifications.href });
  if (!a.id) return null;
  if (rows[0]) return rows[0].href;
  // Already read: still open it.
  const [row] = await db.select({ href: notifications.href }).from(notifications)
    .where(and(eq(notifications.id, a.id), eq(notifications.workspaceId, a.workspaceId), eq(notifications.userId, a.userId)));
  return row?.href ?? null;
}

/** Tell the owners and admins that an account needs reconnecting. */
export function notifyExpired(db: Db, workspaceId: string, accountName: string) {
  return notify(db, {
    workspaceId, kind: 'account.expired', managers: true, href: '/app/channels',
    title: `「${accountName}」的授權失效了`,
    body: '重新連結之前，這個帳號的排程貼文都會發送失敗。',
  });
}
