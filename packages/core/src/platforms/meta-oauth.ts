import { classifyGraph, form, request, type FetchFn } from './http';
import { GRAPH_VERSION } from './meta';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** What the app asks a page admin to grant. Each must also be enabled on the app's use cases. */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  // The rest are optional, so a connection without them still publishes.
  // Listing a Page's posts and reading their reactions and comments needs this one.
  'pages_read_user_content',
  'read_insights',
  'instagram_manage_insights',
  // Only the first comment needs these; posts still go out without them.
  'pages_manage_engagement',
  'instagram_manage_comments',
];

/** Scopes without which a connected account can still publish, only with fewer numbers and no first comment. */
export const OPTIONAL_META_SCOPES = ['pages_read_user_content', 'read_insights', 'instagram_manage_insights', 'pages_manage_engagement', 'instagram_manage_comments'];

export type MetaGrant = { pages: MetaPage[]; missing: string[] };

export type MetaApp = { appId: string; appSecret: string; redirectUri: string };

export type MetaPage = {
  id: string;
  name: string;
  /** Derived from a long-lived user token, so it does not expire on its own. */
  token: string;
  instagram: { id: string; username: string } | null;
};

/** The Facebook dialog URL that starts the authorization. */
export function metaLoginUrl(app: Pick<MetaApp, 'appId' | 'redirectUri'>, state: string): string {
  const p = form({ client_id: app.appId, redirect_uri: app.redirectUri, state, response_type: 'code', scope: META_SCOPES.join(',') });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p}`;
}

async function getJson(fetchFn: FetchFn, url: string) {
  return (await request(fetchFn, 'facebook', url, { method: 'GET', idempotent: true, classify: classifyGraph })).body as Record<string, unknown>;
}

/**
 * Turn the dialog's `code` into every Page the user granted, each with its own token, and
 * the requested scopes the user unticked in the dialog.
 *
 * The short-lived user token from the code is exchanged for a long-lived one first:
 * Page tokens inherit their lifetime from the user token they were read with, and only
 * those read with a long-lived user token stop expiring.
 *
 * Raises:
 *   PlatformError: the code was already used or expired (`invalid`), or Meta refused.
 */
export async function exchangeCodeForPages(fetchFn: FetchFn, app: MetaApp, code: string): Promise<MetaGrant> {
  const short = await getJson(fetchFn, `${GRAPH}/oauth/access_token?${form({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: app.redirectUri, code })}`);
  const long = await getJson(fetchFn, `${GRAPH}/oauth/access_token?${form({ grant_type: 'fb_exchange_token', client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: String(short.access_token) })}`);

  const pages: MetaPage[] = [];
  let url: string | undefined = `${GRAPH}/me/accounts?${form({ fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100, access_token: String(long.access_token) })}`;
  while (url) {
    const res = await getJson(fetchFn, url);
    for (const p of (res.data as Array<Record<string, any>> | undefined) ?? []) {
      const ig = p.instagram_business_account;
      pages.push({ id: String(p.id), name: String(p.name), token: String(p.access_token), instagram: ig ? { id: String(ig.id), username: String(ig.username ?? '') } : null });
    }
    url = (res.paging as { next?: string } | undefined)?.next;
  }
  // The dialog lets people untick permissions, so what was asked for is not what was given.
  const perms = await getJson(fetchFn, `${GRAPH}/me/permissions?${form({ access_token: String(long.access_token) })}`);
  const granted = new Set(((perms.data as Array<{ permission?: string; status?: string }> | undefined) ?? []).filter((p) => p.status === 'granted').map((p) => String(p.permission)));
  return { pages, missing: META_SCOPES.filter((s) => !granted.has(s)) };
}
