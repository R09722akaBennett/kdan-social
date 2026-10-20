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

export interface PlatformClient<C = Credentials> {
  readonly platform: Platform;
  /**
   * Publish one post now.
   *
   * Raises:
   *   PlatformError: classified so the caller knows whether a retry is safe.
   */
  publish(account: AccountRef<C>, input: PublishInput): Promise<PublishResult>;
  /** Current follower count, or null when the platform has no number for that day yet. */
  followers(account: AccountRef<C>, now: Date): Promise<number | null>;
  /** The post's numbers so far, read with the same credentials it was published with. */
  metrics(account: AccountRef<C>, externalPostId: string): Promise<PostMetrics>;
}
