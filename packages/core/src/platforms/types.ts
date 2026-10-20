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
}
