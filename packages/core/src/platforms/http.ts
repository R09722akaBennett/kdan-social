export type Platform = 'facebook' | 'instagram' | 'line';

/**
 * How a failed platform call should be handled.
 *
 * - auth: the token no longer works; the account needs reconnecting.
 * - rate_limited / transient: nothing was published; safe to retry later.
 * - invalid: the platform rejected the content; retrying will fail the same way.
 * - unknown_outcome: the request may have published; retrying could post twice.
 */
export type ErrorKind = 'auth' | 'rate_limited' | 'invalid' | 'transient' | 'unknown_outcome';

export class PlatformError extends Error {
  constructor(
    readonly platform: Platform,
    readonly kind: ErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(mask(message));
    this.name = 'PlatformError';
  }
}

export type FetchFn = typeof fetch;

const TIMEOUT_MS = 30_000;

/** Remove tokens from text that may reach logs or the UI. */
export function mask(text: string): string {
  return text
    .replace(/(access_token|client_secret|channel_secret)=[^&\s"]+/gi, '$1=***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer ***');
}

// Graph error codes that mean the token or its permission is gone, per Meta's error reference:
// 190 expired or revoked token, 102 session, 10 and 200 missing permission.
const GRAPH_AUTH_CODES = new Set([190, 102, 10, 200]);
// Graph throttling codes: app, user, page and per-account limits.
const GRAPH_RATE_CODES = new Set([4, 17, 32, 341, 613, 80001, 80002, 80004, 80005, 80006, 80008]);

type Classifier = (status: number, body: unknown) => ErrorKind | null;

/** Classify a Graph API error body; null when the body is not a Graph error. */
export const classifyGraph: Classifier = (status, body) => {
  const code = (body as { error?: { code?: number } } | null)?.error?.code;
  if (code !== undefined && GRAPH_AUTH_CODES.has(code)) return 'auth';
  if (code !== undefined && GRAPH_RATE_CODES.has(code)) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  return null;
};

/**
 * Send one request and return the parsed JSON body and headers.
 *
 * `idempotent` says whether repeating this request could duplicate something the
 * customer's audience sees. When it is false, a timeout, a dropped connection or a 5xx
 * becomes `unknown_outcome` rather than `transient`, because the platform may have
 * acted before we lost the answer.
 *
 * Raises:
 *   PlatformError: on any non-2xx response or network failure.
 */
export async function request(
  fetchFn: FetchFn,
  platform: Platform,
  url: string,
  init: RequestInit & { idempotent: boolean; classify?: Classifier },
): Promise<{ body: unknown; headers: Headers }> {
  const { idempotent, classify, ...rest } = init;
  let res: Response;
  try {
    res = await fetchFn(url, { ...rest, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new PlatformError(platform, idempotent ? 'transient' : 'unknown_outcome', `Request to ${platform} failed: ${why}`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (res.ok) return { body, headers: res.headers };

  const detail = typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300);
  const message = `${platform} returned HTTP ${res.status}: ${detail}`;
  const kind = classify?.(res.status, body)
    ?? (res.status === 401 || res.status === 403 ? 'auth'
      : res.status === 429 ? 'rate_limited'
      : res.status >= 500 ? (idempotent ? 'transient' : 'unknown_outcome')
      : 'invalid');
  throw new PlatformError(platform, kind, message, res.status);
}

/** Encode fields as a form body, skipping undefined values. */
export function form(fields: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) p.set(k, String(v));
  return p;
}
