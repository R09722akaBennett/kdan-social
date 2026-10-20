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
  createdAt: createdAt(),
});

export const markets = pgTable(
  'markets',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    locale: text('locale').notNull(),
    timeZone: text('time_zone').notNull(),
    requiresReview: boolean('requires_review').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('markets_workspace_code').on(t.workspaceId, t.code)],
);

export const connectedAccounts = pgTable(
  'connected_accounts',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    marketId: uuid('market_id').notNull().references(() => markets.id),
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

export type MediaItem = { url: string; alt?: string };

export const postVariants = pgTable(
  'post_variants',
  {
    id: id(),
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    platform: platform('platform').notNull(),
    body: text('body').notNull(),
    media: jsonb('media').$type<MediaItem[]>().notNull().default([]),
    reviewStatus: reviewStatus('review_status').notNull().default('draft'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('variants_post_market_platform').on(t.postId, t.marketId, t.platform)],
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
