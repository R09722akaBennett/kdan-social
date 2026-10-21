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
// What kind of Instagram post this is; Facebook and LINE only take `post`.
export const postFormat = pgEnum('post_format', ['post', 'reel', 'story']);
export const taskStatus = pgEnum('task_status', [
  'scheduled',
  'running',
  'published',
  'dry_run',
  'failed',
  'needs_check',
  'missed',
  // Withdrawn before it ran; the dispatcher only ever picks `scheduled`.
  'cancelled',
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
  // Set when someone closes the setup checklist on the overview.
  onboardingDismissedAt: timestamp('onboarding_dismissed_at', { withTimezone: true }),
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
 * Someone asked to join a workspace, by email. Signing in with that email accepts it;
 * the sign-in link proves the address, so no separate token is needed.
 */
export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // Stored lower-case, as Supabase stores user emails.
    email: text('email').notNull(),
    role: memberRole('role').notNull().default('editor'),
    invitedBy: text('invited_by').notNull(),
    // The secret in the invite link. Emails are not verified at sign-up, so only someone
    // holding the link may join; the email just says whom it was meant for.
    token: text('token').notNull().default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invites_workspace_email').on(t.workspaceId, t.email), index('invites_email').on(t.email), uniqueIndex('invites_token').on(t.token)],
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
    // Posts a week the team aims for, after Buffer's posting goal; null until one is set.
    postingGoal: integer('posting_goal'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('accounts_workspace_platform_external').on(t.workspaceId, t.platform, t.externalId)],
);

export const posts = pgTable('posts', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // The main text; a variant whose body differs was customised for its account.
  // Null on posts created before the main text was kept.
  body: text('body'),
  // Email of whoever wrote it, shown to reviewers. Null on posts created before this was kept.
  createdBy: text('created_by'),
  // Left under the post on Facebook and Instagram once it is out; LINE has no comments.
  firstComment: text('first_comment'),
  format: postFormat('format').notNull().default('post'),
  createdAt: createdAt(),
});

export const postComments = pgTable(
  'post_comments',
  {
    id: id(),
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    author: text('author').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('comments_post').on(t.postId, t.createdAt)],
);

/**
 * `previewUrl` is a small JPEG: LINE's preview for an image, or a frame of a video for our
 * own pages. Items without `type` are images, as every item was before videos.
 */
export type MediaItem = { url: string; alt?: string; previewUrl?: string; type?: 'image' | 'video' };

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
    // The first comment's outcome. A failed comment leaves the post published: retrying
    // the publish to get the comment through would post it twice.
    commentId: text('comment_id'),
    commentError: text('comment_error'),
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

// One row per recipient, so each member reads and clears their own copy.
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    href: text('href'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_recipient').on(t.userId, t.workspaceId, t.createdAt)],
);

// Blogs and news a workspace follows for things to post about, after Buffer's Feeds.
export const feeds = pgTable(
  'feeds',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // The RSS or Atom address actually read, after following a page's feed link.
    url: text('url').notNull(),
    title: text('title').notNull(),
    siteUrl: text('site_url'),
    createdBy: text('created_by').notNull(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    // Why the last read failed; cleared by the next one that works.
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('feeds_workspace_url').on(t.workspaceId, t.url)],
);

export const feedItems = pgTable(
  'feed_items',
  {
    id: id(),
    feedId: uuid('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
    // The entry's guid or id, else its link, so a re-read finds the same row.
    key: text('key').notNull(),
    title: text('title').notNull(),
    link: text('link'),
    summary: text('summary').notNull().default(''),
    imageUrl: text('image_url'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('feed_items_feed_key').on(t.feedId, t.key), index('feed_items_recent').on(t.feedId, t.publishedAt)],
);

export const inboxStatus = pgEnum('inbox_status', ['open', 'done']);

// Comments people left under an account's Facebook and Instagram posts, after Buffer's
// Community inbox. The account's own comments (first comments, replies) are not kept.
export const inboxComments = pgTable(
  'inbox_comments',
  {
    id: id(),
    accountId: uuid('account_id').notNull().references(() => connectedAccounts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    postExternalId: text('post_external_id').notNull(),
    // Set when the comment answers another comment rather than the post.
    parentExternalId: text('parent_external_id'),
    author: text('author').notNull(),
    text: text('text').notNull(),
    commentedAt: timestamp('commented_at', { withTimezone: true }).notNull(),
    status: inboxStatus('status').notNull().default('open'),
    replyExternalId: text('reply_external_id'),
    replyText: text('reply_text'),
    repliedBy: text('replied_by'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('inbox_account_external').on(t.accountId, t.externalId), index('inbox_queue').on(t.accountId, t.status, t.commentedAt)],
);

export const tagColor = pgEnum('tag_color', ['blue', 'green', 'orange', 'purple', 'pink', 'teal', 'gray']);

// Labels a workspace defines for its posts, after Buffer's tags; a color name, not a code,
// so the page keeps them readable in both themes.
export const tags = pgTable(
  'tags',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: tagColor('color').notNull().default('blue'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('tags_workspace_name').on(t.workspaceId, sql`lower(${t.name})`)],
);

export const postTags = pgTable(
  'post_tags',
  {
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] }), index('post_tags_tag').on(t.tagId)],
);

export const ideaStatus = pgEnum('idea_status', ['unassigned', 'todo', 'in_progress', 'done']);

// Content not yet written as a post, on a board the whole workspace shares, after Buffer's Ideas.
export const ideas = pgTable(
  'ideas',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    status: ideaStatus('status').notNull().default('unassigned'),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    // Cards in a column are ordered by when they were last moved or edited, newest first.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ideas_board').on(t.workspaceId, t.status, t.updatedAt)],
);

// A member's own conversations with the AI assistant; nobody else in the workspace sees them.
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_conversations_owner').on(t.userId, t.workspaceId, t.updatedAt)],
);

export type PlanItem = { date: string; time: string; accountIds: string[]; topic: string; body: string };

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: id(),
    conversationId: uuid('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    /** Posts the assistant proposed, already checked against the workspace's accounts. */
    plan: jsonb('plan').$type<PlanItem[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_messages_conversation').on(t.conversationId, t.createdAt)],
);

// What a person told the onboarding questions, so the product can be shaped for them later.
export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey(),
  displayName: text('display_name'),
  describes: text('describes'),
  accounts: text('accounts'),
  platforms: text('platforms').array().notNull().default(sql`'{}'::text[]`),
  goals: text('goals').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Set when they finish or skip the questions; until then sign-in leads back to them. */
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
});

export type GlossaryEntry = { term: string; rule: string };

/** How the workspace writes. AI prompts are built from this; the composer checks `banned` itself. */
export const brandVoices = pgTable('brand_voices', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  about: text('about').notNull().default(''),
  // 0 is most formal / most data-led, 100 most casual / most emotional.
  formality: integer('formality').notNull().default(40),
  persuasion: integer('persuasion').notNull().default(30),
  emoji: text('emoji').$type<'none' | 'few' | 'many'>().notNull().default('few'),
  banned: jsonb('banned').$type<string[]>().notNull().default([]),
  glossary: jsonb('glossary').$type<GlossaryEntry[]>().notNull().default([]),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Rules a group adds on top of the brand voice, such as the language its accounts write in. */
export const groupVoices = pgTable('group_voices', {
  groupId: uuid('group_id').primaryKey().references(() => accountGroups.id, { onDelete: 'cascade' }),
  rules: text('rules').notNull().default(''),
  examples: jsonb('examples').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The latest numbers for one published task, refreshed daily for a month after it went out. */
export const postMetrics = pgTable('post_metrics', {
  taskId: uuid('task_id').primaryKey().references(() => publishTasks.id, { onDelete: 'cascade' }),
  engagements: integer('engagements'),
  opens: integer('opens'),
  detail: jsonb('detail').$type<Record<string, number | null>>().notNull().default({}),
  // Reach and views need the insights scopes; null until they are granted and read.
  reach: integer('reach'),
  views: integer('views'),
  insights: jsonb('insights').$type<Record<string, number | null>>().notNull().default({}),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Posts read back from an account, including ones published outside kdan-social, so
 * analytics covers everything the account posted. Refreshed daily for 60 days.
 */
export const accountPosts = pgTable(
  'account_posts',
  {
    id: id(),
    accountId: uuid('account_id').notNull().references(() => connectedAccounts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    text: text('text').notNull().default(''),
    permalink: text('permalink'),
    mediaType: text('media_type'),
    engagements: integer('engagements'),
    detail: jsonb('detail').$type<Record<string, number | null>>().notNull().default({}),
    reach: integer('reach'),
    views: integer('views'),
    insights: jsonb('insights').$type<Record<string, number | null>>().notNull().default({}),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('account_posts_account_external').on(t.accountId, t.externalId), index('account_posts_published').on(t.publishedAt)],
);

/** One day of an account's own numbers (reach, views, engagements, follows...), as the platform reports them. */
export const accountDailyMetrics = pgTable(
  'account_daily_metrics',
  {
    accountId: uuid('account_id').notNull().references(() => connectedAccounts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    metrics: jsonb('metrics').$type<Record<string, number | null>>().notNull().default({}),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.day] })],
);

/** The latest audience breakdown of one kind (age, gender, country...) for an account. */
export const audienceBreakdowns = pgTable(
  'audience_breakdowns',
  {
    accountId: uuid('account_id').notNull().references(() => connectedAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    unit: text('unit').$type<'count' | 'percent'>().notNull(),
    items: jsonb('items').$type<Array<{ key: string; value: number }>>().notNull().default([]),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.kind] })],
);
