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
];

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
 * Turn the dialog's `code` into every Page the user granted, each with its own token.
 *
 * The short-lived user token from the code is exchanged for a long-lived one first:
 * Page tokens inherit their lifetime from the user token they were read with, and only
 * those read with a long-lived user token stop expiring.
 *
 * Raises:
 *   PlatformError: the code was already used or expired (`invalid`), or Meta refused.
 */
export async function exchangeCodeForPages(fetchFn: FetchFn, app: MetaApp, code: string): Promise<MetaPage[]> {
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
  return pages;
}
