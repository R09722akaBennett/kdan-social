import type { MediaItem } from '../db/schema';
import type { Platform } from './http';

export type FacebookCredentials = { pageAccessToken: string };
export type LineCredentials = { channelId: string; channelSecret: string };
export type Credentials = FacebookCredentials | LineCredentials;

export type AccountRef<C = Credentials> = { externalId: string; credentials: C };

export type PublishInput = {
  body: string;
  media: MediaItem[];
  /** Stable per task, so a retried request can be recognised by platforms that support it. */
  idempotencyKey: string;
};

export type PublishResult = { externalPostId: string };

/**
 * What one published post has earned, in the platform's own terms. `engagements` is the
 * comparable total (FB reactions + comments + shares, IG likes + comments, LINE clicks);
 * null means the platform has no number, never zero.
 */
export type PostMetrics = { engagements: number | null; opens?: number | null; detail: Record<string, number | null> };

/** One day of account-level numbers, keyed by our metric names (reach, views, engagements, follows, unfollows, ...). */
export type DailyMetrics = { day: string; metrics: Record<string, number | null> };
/** One audience breakdown, largest first, as the platform reports it (counts or percentages). */
export type Demographic = { kind: 'age' | 'gender' | 'country' | 'city' | 'area' | 'app' | 'tenure'; unit: 'count' | 'percent'; items: Array<{ key: string; value: number }> };
/** One post's reach and views, plus whatever else the platform adds. */
export type PostInsights = { reach: number | null; views: number | null; detail: Record<string, number | null> };
/** A metric the platform would not give, so the collector can say why the page lacks it. */
export type InsightIssue = { metric: string; message: string };
export type WithIssues<T> = { value: T; issues: InsightIssue[] };

/** A post found on the account itself, whoever published it, with its numbers at the time it was read. */
export type AccountPost = { externalId: string; publishedAt: Date; text: string; permalink: string | null; mediaType: string | null; metrics: PostMetrics };

export interface PlatformClient<C = Credentials> {
  readonly platform: Platform;
  /**
   * Publish one post now.
   *
   * Raises:
   *   PlatformError: classified so the caller knows whether a retry is safe.
   */
  publish(account: AccountRef<C>, input: PublishInput): Promise<PublishResult>;
  /**
   * Comment on a post this account just published; absent where the platform has no comments.
   *
   * Raises:
   *   PlatformError: as `publish`; never retried, since the post itself is already out.
   */
  comment?(account: AccountRef<C>, externalPostId: string, text: string): Promise<{ externalCommentId: string }>;
  /** Current follower count, or null when the platform has no number for that day yet. */
  followers(account: AccountRef<C>, now: Date): Promise<number | null>;
  /** The post's numbers so far, read with the same credentials it was published with. */
  metrics(account: AccountRef<C>, externalPostId: string): Promise<PostMetrics>;
  /** Posts published on the account since `since`, newest first; absent where the platform has no such list. */
  recentPosts?(account: AccountRef<C>, since: Date): Promise<AccountPost[]>;
  /** Account-level numbers for each day in [since, until). Metrics the platform refuses become issues, not errors. */
  dailyInsights?(account: AccountRef<C>, since: Date, until: Date): Promise<WithIssues<DailyMetrics[]>>;
  /** The latest audience breakdowns. Missing ones (too few followers, no permission) become issues. */
  demographics?(account: AccountRef<C>, now: Date): Promise<WithIssues<Demographic[]>>;
  /** One post's reach and views. Missing metrics become issues. */
  postInsights?(account: AccountRef<C>, externalPostId: string): Promise<WithIssues<PostInsights>>;
}
