import { form, PlatformError, request, type FetchFn } from './http';
import type { AccountRef, LineCredentials, PlatformClient } from './types';

const API = 'https://api.line.me';

/** Issue a short-lived stateless channel access token from the channel ID and secret. */
async function issueToken(fetchFn: FetchFn, c: LineCredentials): Promise<string> {
  const { body } = await request(fetchFn, 'line', `${API}/oauth2/v3/token`, {
    method: 'POST',
    body: form({ grant_type: 'client_credentials', client_id: c.channelId, client_secret: c.channelSecret }),
    idempotent: true,
    // A rejected ID or secret comes back as 400, which means the saved credentials are wrong.
    classify: (status) => (status === 400 || status === 401 ? 'auth' : null),
  });
  const token = (body as { access_token?: string }).access_token;
  if (!token) throw new PlatformError('line', 'auth', 'LINE did not return an access token');
  return token;
}

/** The day LINE insight reports on: yesterday in Japan time, as yyyyMMdd. */
export function lineInsightDay(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 3600_000 - 24 * 3600_000);
  return jst.toISOString().slice(0, 10).replaceAll('-', '');
}

export type LineQuota = { limit: number | null; used: number };
export type LineBotInfo = { userId: string; basicId: string; displayName: string };
export type LineAudience = { followers: number; targetedReaches: number };

export type LineClient = PlatformClient<LineCredentials> & {
  /** This month's message limit (null when the plan has none) and messages sent so far. */
  quota(account: AccountRef<LineCredentials>): Promise<LineQuota>;
  /**
   * The Official Account behind the credentials.
   *
   * Raises:
   *   PlatformError: `auth` when the channel ID or secret is wrong.
   */
  botInfo(credentials: LineCredentials): Promise<LineBotInfo>;
  /** Yesterday's friends and the reachable share of them (friends minus blocks), or null before LINE has the numbers. */
  audience(account: AccountRef<LineCredentials>, now: Date): Promise<LineAudience | null>;
};

/**
 * LINE Official Account broadcast through the Messaging API.
 *
 * LINE bills per recipient, not per message object: one broadcast of up to five
 * objects costs one message for each friend.
 */
export function lineClient(fetchFn: FetchFn = fetch): LineClient {
  const auth = async (a: AccountRef<LineCredentials>) => ({ Authorization: `Bearer ${await issueToken(fetchFn, a.credentials)}` });
  const audience = async (account: AccountRef<LineCredentials>, now: Date): Promise<LineAudience | null> => {
    const { body } = await request(fetchFn, 'line', `${API}/v2/bot/insight/followers?date=${lineInsightDay(now)}`, {
      method: 'GET',
      headers: await auth(account),
      idempotent: true,
    });
    const b = body as { status?: string; followers?: number; targetedReaches?: number };
    if (b.status !== 'ready' || typeof b.followers !== 'number') return null;
    return { followers: b.followers, targetedReaches: b.targetedReaches ?? b.followers };
  };

  return {
    platform: 'line',
    async publish(account, input) {
      if (input.media.length > 4) throw new PlatformError('line', 'invalid', 'LINE allows one text and at most four images per broadcast');
      const messages = [
        ...(input.body ? [{ type: 'text', text: input.body }] : []),
        // LINE caps preview images at 1 MB; the composer uploads a small copy for that.
        ...input.media.map((m) => ({ type: 'image', originalContentUrl: m.url, previewImageUrl: m.previewUrl ?? m.url })),
      ];
      if (messages.length === 0) throw new PlatformError('line', 'invalid', 'Nothing to send');
      try {
        const { headers } = await request(fetchFn, 'line', `${API}/v2/bot/message/broadcast`, {
          method: 'POST',
          headers: { ...(await auth(account)), 'Content-Type': 'application/json', 'X-Line-Retry-Key': input.idempotencyKey },
          body: JSON.stringify({ messages }),
          // The retry key makes a repeat harmless: LINE answers 409 instead of sending again.
          idempotent: true,
          // A spent monthly quota also comes back as 429, but it will not recover until next
          // month, so retrying it in a few minutes only burns attempts.
          classify: (status, body) => (status === 429 && /monthly limit/i.test(JSON.stringify(body)) ? 'invalid' : null),
        });
        return { externalPostId: headers.get('x-line-request-id') ?? input.idempotencyKey };
      } catch (e) {
        if (e instanceof PlatformError && e.status === 409) return { externalPostId: input.idempotencyKey };
        throw e;
      }
    },
    async followers(account, now) {
      return (await audience(account, now))?.followers ?? null;
    },
    audience,
    async botInfo(credentials) {
      const { body } = await request(fetchFn, 'line', `${API}/v2/bot/info`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${await issueToken(fetchFn, credentials)}` },
        idempotent: true,
      });
      const b = body as Partial<LineBotInfo>;
      return { userId: String(b.userId ?? ''), basicId: String(b.basicId ?? ''), displayName: String(b.displayName ?? '') };
    },
    async quota(account) {
      const headers = await auth(account);
      const [q, c] = await Promise.all([
        request(fetchFn, 'line', `${API}/v2/bot/message/quota`, { method: 'GET', headers, idempotent: true }),
        request(fetchFn, 'line', `${API}/v2/bot/message/quota/consumption`, { method: 'GET', headers, idempotent: true }),
      ]);
      const quota = q.body as { type?: string; value?: number };
      return { limit: quota.type === 'limited' ? quota.value ?? 0 : null, used: (c.body as { totalUsage?: number }).totalUsage ?? 0 };
    },
  };
}
