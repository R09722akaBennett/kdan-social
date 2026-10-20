import { classifyGraph, form, PlatformError, request, type FetchFn } from './http';
import type { AccountRef, FacebookCredentials, PlatformClient, PublishInput, PublishResult } from './types';

// Pin the Graph version so a Meta release cannot change behaviour under us; bump deliberately.
export const GRAPH_VERSION = 'v25.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function graph(fetchFn: FetchFn, platform: 'facebook' | 'instagram') {
  return {
    post: async (path: string, token: string, fields: Record<string, string | number | boolean | undefined>, idempotent: boolean) =>
      (await request(fetchFn, platform, `${GRAPH}/${path}`, {
        method: 'POST',
        // Token in the body, not the URL, so it never lands in access logs.
        body: form({ ...fields, access_token: token }),
        idempotent,
        classify: classifyGraph,
      })).body as Record<string, unknown>,
    get: async (path: string, token: string, fields: string) =>
      (await request(fetchFn, platform, `${GRAPH}/${path}?${form({ fields, access_token: token })}`, {
        method: 'GET',
        idempotent: true,
        classify: classifyGraph,
      })).body as Record<string, unknown>,
  };
}

/** Facebook Page posting through the Graph API with a page access token. */
export function facebookClient(fetchFn: FetchFn = fetch): PlatformClient<FacebookCredentials> {
  const g = graph(fetchFn, 'facebook');
  return {
    platform: 'facebook',
    async publish(account: AccountRef<FacebookCredentials>, input: PublishInput): Promise<PublishResult> {
      const { externalId: pageId, credentials: { pageAccessToken: token } } = account;
      if (input.media.length === 0) {
        const res = await g.post(`${pageId}/feed`, token, { message: input.body }, false);
        return { externalPostId: String(res.id) };
      }
      if (input.media.length === 1) {
        const res = await g.post(`${pageId}/photos`, token, { url: input.media[0]!.url, caption: input.body }, false);
        return { externalPostId: String(res.post_id ?? res.id) };
      }
      // Several photos: upload each unpublished, then attach them to one feed post.
      // Unpublished uploads are invisible, so retrying them cannot duplicate anything.
      const ids: string[] = [];
      for (const m of input.media) {
        const res = await g.post(`${pageId}/photos`, token, { url: m.url, published: false }, true);
        ids.push(String(res.id));
      }
      const attached = Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]));
      const res = await g.post(`${pageId}/feed`, token, { message: input.body, ...attached }, false);
      return { externalPostId: String(res.id) };
    },
    async followers(account) {
      const res = await g.get(account.externalId, account.credentials.pageAccessToken, 'followers_count');
      return typeof res.followers_count === 'number' ? res.followers_count : null;
    },
  };
}

/**
 * Instagram professional-account posting through the Graph API, using the access
 * token of the Facebook Page the Instagram account is linked to.
 */
export function instagramClient(fetchFn: FetchFn = fetch, sleep: Sleep = realSleep): PlatformClient<FacebookCredentials> {
  const g = graph(fetchFn, 'instagram');

  // A container must finish processing before it can be published; images usually are
  // ready at once, carousels can take a few seconds.
  async function waitReady(containerId: string, token: string) {
    for (let i = 0; i < 6; i++) {
      const res = await g.get(containerId, token, 'status_code');
      if (res.status_code === 'FINISHED') return;
      if (res.status_code === 'ERROR' || res.status_code === 'EXPIRED') {
        throw new PlatformError('instagram', 'invalid', `Instagram could not process the media (status ${String(res.status_code)})`);
      }
      await sleep(2000 * (i + 1));
    }
    throw new PlatformError('instagram', 'transient', 'Instagram media is still processing; try again later');
  }

  return {
    platform: 'instagram',
    async publish(account, input) {
      const { externalId: igId, credentials: { pageAccessToken: token } } = account;
      if (input.media.length === 0) throw new PlatformError('instagram', 'invalid', 'Instagram posts need at least one image');
      if (input.media.length > 10) throw new PlatformError('instagram', 'invalid', 'Instagram carousels take at most 10 images');

      let containerId: string;
      if (input.media.length === 1) {
        const m = input.media[0]!;
        containerId = String((await g.post(`${igId}/media`, token, { image_url: m.url, caption: input.body, alt_text: m.alt }, true)).id);
      } else {
        const children: string[] = [];
        for (const m of input.media) {
          children.push(String((await g.post(`${igId}/media`, token, { image_url: m.url, is_carousel_item: true, alt_text: m.alt }, true)).id));
        }
        containerId = String((await g.post(`${igId}/media`, token, { media_type: 'CAROUSEL', children: children.join(','), caption: input.body }, true)).id);
      }
      await waitReady(containerId, token);
      const res = await g.post(`${igId}/media_publish`, token, { creation_id: containerId }, false);
      return { externalPostId: String(res.id) };
    },
    async followers(account) {
      const res = await g.get(account.externalId, account.credentials.pageAccessToken, 'followers_count');
      return typeof res.followers_count === 'number' ? res.followers_count : null;
    },
  };
}
