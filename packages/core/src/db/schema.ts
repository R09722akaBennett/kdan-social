import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const platform = pgEnum('platform', ['facebook', 'instagram', 'line']);
export const accountStatus = pgEnum('account_status', ['active', 'expired', 'revoked']);
export const reviewStatus = pgEnum('review_status', ['draft', 'pending', 'approved', 'changes_requested']);
export const taskStatus = pgEnum('task_status', [
  'scheduled',
  'running',
  'published',
  'dry_run',
  'failed',
  'needs_check',
  'missed',
]);

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  // Off by default: a new workspace only records what it would publish until someone turns this on.
  publishingEnabled: boolean('publishing_enabled').notNull().default(false),
  // The clock the workspace is shown in, and the zone new accounts start with.
  timeZone: text('time_zone').notNull().default('Asia/Taipei'),
  // Posts by editors wait for an owner or admin before they go out.
  requiresReview: boolean('requires_review').notNull().default(true),
  createdAt: createdAt(),
});

export const memberRole = pgEnum('member_role', ['owner', 'admin', 'editor', 'reviewer']);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // The auth provider's user id. No foreign key: Supabase keeps users in its own
    // `auth` schema, and the core must not depend on that to stay portable.
    userId: uuid('user_id').notNull(),
    email: text('email').notNull(),
    role: memberRole('role').notNull().default('editor'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index('members_user').on(t.userId)],
);

/**
 * Pages returned by one Facebook authorization, held until the user picks which to add.
 * The payload carries page tokens, so it is encrypted and expires after a few minutes.
 */
export const metaConnectSessions = pgTable('meta_connect_sessions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  payload: text('payload').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/**
 * A customer-named set of accounts that are usually posted to together, such as a
 * country, a sub-brand or a store. Groups only select accounts; they own no content.
 */
export const accountGroups = pgTable(
  'account_groups',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('groups_workspace_name').on(t.workspaceId, t.name)],
);

export const connectedAccounts = pgTable(
  'connected_accounts',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // At most one group per account; deleting the group leaves the account ungrouped.
    groupId: uuid('group_id').references(() => accountGroups.id, { onDelete: 'set null' }),
    // "Local time" schedules run on this account's clock.
    timeZone: text('time_zone').notNull(),
    platform: platform('platform').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    // Encrypted with crypto.ts; never selected into anything that leaves the server.
    credentials: text('credentials').notNull(),
    status: accountStatus('status').notNull().default('active'),
    statusDetail: text('status_detail'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('accounts_workspace_platform_external').on(t.workspaceId, t.platform, t.externalId)],
);

export const posts = pgTable('posts', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: createdAt(),
});

/** `previewUrl` is a small copy for LINE, whose preview images must be under 1 MB. */
export type MediaItem = { url: string; alt?: string; previewUrl?: string };

export const postVariants = pgTable(
  'post_variants',
  {
    id: id(),
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    // One variant per account, so each account can carry its own text.
    accountId: uuid('account_id').notNull().references(() => connectedAccounts.id),
    platform: platform('platform').notNull(),
    body: text('body').notNull(),
    media: jsonb('media').$type<MediaItem[]>().notNull().default([]),
    reviewStatus: reviewStatus('review_status').notNull().default('draft'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('variants_post_account').on(t.postId, t.accountId)],
);

export const publishTasks = pgTable(
  'publish_tasks',
  {
    id: id(),
    variantId: uuid('variant_id').notNull().references(() => postVariants.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => connectedAccounts.id),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    status: taskStatus('status').notNull().default('scheduled'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    externalPostId: text('external_post_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('tasks_variant_account').on(t.variantId, t.accountId),
    index('tasks_due').on(t.status, t.runAt),
  ],
);

export const followerSnapshots = pgTable(
  'follower_snapshots',
  {
    accountId: uuid('account_id').notNull().references(() => connectedAccounts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    followers: integer('followers').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.day] })],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_workspace_at').on(t.workspaceId, t.at)],
);
