import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { accountContext, decrypt } from './crypto';
import { accountPosts, auditLog, connectedAccounts, inboxComments, workspaces, type Db } from './db/index';
import { PlatformError } from './platforms/http';
import type { PlatformClient } from './platforms/types';
import type { Clients } from './publish/dispatch';
import { publishingAllowed } from './writes';

export class InboxError extends Error {}

// Comments on older posts are rare, and each post costs one request per sync.
export const INBOX_WINDOW_DAYS = 14;
const REPLY_MAX = 2200;

export type InboxSync = { accounts: number; comments: number; failed: number };

/**
 * Read comments under the last 14 days of each active Facebook and Instagram account's
 * posts into the inbox. New comments arrive open; re-reading one keeps its status and
 * reply. Comments the account wrote itself are skipped.
 *
 * Args:
 *   workspaceId: only that workspace's accounts, as from the inbox's refresh button.
 */
export async function syncComments(opts: { db: Db; clients: Clients; key: Buffer; workspaceId?: string; now?: Date; log?: (line: string) => void }): Promise<InboxSync> {
  const { db, log = () => {} } = opts;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - INBOX_WINDOW_DAYS * 86_400_000);
  const summary: InboxSync = { accounts: 0, comments: 0, failed: 0 };
  const accounts = await db.select().from(connectedAccounts).where(and(
    eq(connectedAccounts.status, 'active'), inArray(connectedAccounts.platform, ['facebook', 'instagram']),
    opts.workspaceId ? eq(connectedAccounts.workspaceId, opts.workspaceId) : undefined,
  ));
  for (const a of accounts) {
    const client = opts.clients[a.platform] as PlatformClient<unknown>;
    if (!client.comments) continue;
    try {
      const credentials = JSON.parse(decrypt(a.credentials, opts.key, accountContext(a)));
      // The nightly import keeps the account's own posts, whoever published them.
      const posts = await db.select({ externalId: accountPosts.externalId }).from(accountPosts)
        .where(and(eq(accountPosts.accountId, a.id), gte(accountPosts.publishedAt, since)));
      for (const p of posts) {
        const comments = await client.comments({ externalId: a.externalId, credentials }, p.externalId);
        for (const c of comments) {
          if (c.authorId === a.externalId) continue;
          const values = { postExternalId: p.externalId, parentExternalId: c.parentExternalId, author: c.author.slice(0, 200), text: c.text.slice(0, 5000), commentedAt: c.createdAt, fetchedAt: now };
          await db.insert(inboxComments).values({ accountId: a.id, externalId: c.externalId, ...values })
            .onConflictDoUpdate({ target: [inboxComments.accountId, inboxComments.externalId], set: values });
          summary.comments++;
        }
      }
      summary.accounts++;
    } catch (e) {
      log(`Comment sync failed for ${a.name} (${a.platform}): ${e instanceof Error ? e.message : String(e)}`);
      summary.failed++;
    }
  }
  return summary;
}

/** The inbox, newest first, with the post each comment is under. */
export function listInbox(db: Db, a: { workspaceId: string; status: 'open' | 'done'; accountId?: string; limit?: number }) {
  return db
    .select({
      comment: inboxComments, account: connectedAccounts.name, accountId: connectedAccounts.id, platform: connectedAccounts.platform,
      postText: accountPosts.text, permalink: accountPosts.permalink,
    })
    .from(inboxComments)
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, inboxComments.accountId))
    .leftJoin(accountPosts, and(eq(accountPosts.accountId, inboxComments.accountId), eq(accountPosts.externalId, inboxComments.postExternalId)))
    .where(and(eq(connectedAccounts.workspaceId, a.workspaceId), eq(inboxComments.status, a.status), a.accountId ? eq(inboxComments.accountId, a.accountId) : undefined))
    .orderBy(desc(inboxComments.commentedAt))
    .limit(a.limit ?? 100);
}

/** How many comments wait in the workspace's inbox, for the sidebar. */
export async function openComments(db: Db, workspaceId: string) {
  const rows = await db.select({ id: inboxComments.id }).from(inboxComments).innerJoin(connectedAccounts, eq(connectedAccounts.id, inboxComments.accountId))
    .where(and(eq(connectedAccounts.workspaceId, workspaceId), eq(inboxComments.status, 'open')));
  return rows.length;
}

async function commentIn(db: Db, workspaceId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db.select({ comment: inboxComments, account: connectedAccounts, workspace: workspaces }).from(inboxComments)
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, inboxComments.accountId))
    .innerJoin(workspaces, eq(workspaces.id, connectedAccounts.workspaceId))
    .where(and(eq(inboxComments.id, id), eq(connectedAccounts.workspaceId, workspaceId)));
  return row ?? null;
}

/**
 * Mark a comment handled, or open it again.
 *
 * Raises:
 *   InboxError: the comment is not in the workspace.
 */
export async function setCommentStatus(db: Db, a: { workspaceId: string; id: string; status: 'open' | 'done' }) {
  const row = await commentIn(db, a.workspaceId, a.id);
  if (!row) throw new InboxError('找不到這則留言，請重新整理後再試。');
  await db.update(inboxComments).set({ status: a.status }).where(eq(inboxComments.id, a.id));
}

/**
 * Answer a comment in public as the account, and mark it handled.
 *
 * A reply goes out under the same switches as a post: while publishing is off it is only
 * logged as `[dry-run]` and the comment stays open, so nothing is said in public by a
 * workspace still being tried out.
 *
 * Returns:
 *   Whether it was only a dry run.
 *
 * Raises:
 *   InboxError: the reply is empty or too long, the comment is not in the workspace, its
 *     account is not active, or the platform refused the reply (with its reason).
 */
export async function replyToComment(opts: { db: Db; clients: Clients; key: Buffer; globalEnabled: boolean; log?: (line: string) => void }, a: { workspaceId: string; id: string; text: string; actor: string; now?: Date }) {
  const { db, log = () => {} } = opts;
  const text = a.text.trim();
  if (!text) throw new InboxError('請先寫下回覆內容。');
  if (text.length > REPLY_MAX) throw new InboxError(`回覆最多 ${REPLY_MAX} 字。`);
  const row = await commentIn(db, a.workspaceId, a.id);
  if (!row) throw new InboxError('找不到這則留言，請重新整理後再試。');
  const { comment, account, workspace } = row;
  if (account.status !== 'active') throw new InboxError(`「${account.name}」的授權已失效，請先重新連結。`);
  const client = opts.clients[account.platform] as PlatformClient<unknown>;
  if (!client.reply) throw new InboxError('這個平台不支援回覆留言。');

  if (!publishingAllowed(opts.globalEnabled, workspace)) {
    log(`[dry-run] Will reply to comment ${comment.externalId} on ${account.platform} ${account.name}`);
    await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'comment.reply_dry_run', target: comment.id, detail: { account: account.name } });
    return { dryRun: true };
  }
  let externalCommentId: string;
  try {
    const credentials = JSON.parse(decrypt(account.credentials, opts.key, accountContext(account)));
    ({ externalCommentId } = await client.reply({ externalId: account.externalId, credentials }, comment.externalId, text));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`Reply to comment ${comment.externalId} on ${account.name} failed: ${message}`);
    throw new InboxError(e instanceof PlatformError && /permission|\(#(10|200)\)/i.test(message)
      ? '帳號還沒授權回覆留言，請到帳號頁重新連結並允許留言權限。'
      : `回覆沒有送出：${message}`);
  }
  await db.update(inboxComments).set({ status: 'done', replyExternalId: externalCommentId, replyText: text, repliedBy: a.actor, repliedAt: a.now ?? new Date() }).where(eq(inboxComments.id, comment.id));
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'comment.replied', target: comment.id, detail: { account: account.name, reply: externalCommentId } });
  return { dryRun: false };
}
