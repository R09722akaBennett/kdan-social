import { classifyGraph, form, PlatformError, request, type FetchFn } from './http';
import { facebookDaily, facebookDemographics, facebookPostInsights, instagramDaily, instagramDemographics, instagramPostInsights } from './meta-insights';
import type { AccountPost, AccountRef, FacebookCredentials, PlatformClient, PlatformComment, PostMetrics, PublishInput, PublishResult } from './types';

// Pin the Graph version so a Meta release cannot change behaviour under us; bump deliberately.
export const GRAPH_VERSION = 'v25.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const total = (parts: Array<number | null>) => (parts.every((p) => p === null) ? null : parts.reduce<number>((s, p) => s + (p ?? 0), 0));

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
    /** Follow a list's `paging.next` until `keep` returns false for an item or the list ends. */
    list: async (path: string, token: string, params: Record<string, string | number>, keep: (item: Record<string, unknown>) => boolean, maxPages = 10) => {
      const items: Array<Record<string, unknown>> = [];
      let url: string | undefined = `${GRAPH}/${path}?${form({ ...params, access_token: token })}`;
      for (let page = 0; url && page < maxPages; page++) {
        const res = (await request(fetchFn, platform, url, { method: 'GET', idempotent: true, classify: classifyGraph })).body as { data?: Array<Record<string, unknown>>; paging?: { next?: string } };
        const data = res.data ?? [];
        const kept = data.filter(keep);
        items.push(...kept);
        // Both lists are newest first, so the first old item means the rest are older too.
        url = kept.length < data.length ? undefined : res.paging?.next;
      }
      return items;
    },
    /** A GET with arbitrary query parameters, for the insights edges. */
    query: async (path: string, token: string, params: Record<string, string | number>) =>
      (await request(fetchFn, platform, `${GRAPH}/${path}?${form({ ...params, access_token: token })}`, {
        method: 'GET',
        idempotent: true,
        classify: classifyGraph,
      })).body as { data?: Array<Record<string, any>> },
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
    // Needs pages_manage_engagement; without it Graph answers with a permission error.
    async comment(account, postId, text) {
      const res = await g.post(`${postId}/comments`, account.credentials.pageAccessToken, { message: text }, false);
      return { externalCommentId: String(res.id) };
    },
    // `filter=stream` lists replies too, each with its `parent`. Reading needs
    // pages_read_user_content; replying needs pages_manage_engagement.
    async comments(account, postId): Promise<PlatformComment[]> {
      const items = await g.list(`${postId}/comments`, account.credentials.pageAccessToken, { fields: 'id,message,from,created_time,parent{id}', filter: 'stream', order: 'reverse_chronological', limit: 50 }, () => true, 4);
      return items.map((c) => {
        const from = c.from as { id?: string; name?: string } | undefined;
        return { externalId: String(c.id), parentExternalId: (c.parent as { id?: string } | undefined)?.id ?? null, author: from?.name ?? '（沒有名稱）', authorId: from?.id ?? null, text: String(c.message ?? ''), createdAt: new Date(String(c.created_time)) };
      });
    },
    async reply(account, commentId, text) {
      const res = await g.post(`${commentId}/comments`, account.credentials.pageAccessToken, { message: text }, false);
      return { externalCommentId: String(res.id) };
    },
    async followers(account) {
      const res = await g.get(account.externalId, account.credentials.pageAccessToken, 'followers_count');
      return typeof res.followers_count === 'number' ? res.followers_count : null;
    },
    async metrics(account, postId): Promise<PostMetrics> {
      // pages_read_engagement covers these counts; reach needs read_insights, which we do not ask for.
      const res = await g.get(postId, account.credentials.pageAccessToken, 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares');
      const summary = (v: unknown) => num((v as { summary?: { total_count?: unknown } } | undefined)?.summary?.total_count);
      const detail = { reactions: summary(res.reactions), comments: summary(res.comments), // Graph omits `shares` entirely when nobody has shared the post.
      shares: num((res.shares as { count?: unknown } | undefined)?.count) ?? 0 };
      return { engagements: total(Object.values(detail)), detail };
    },
    async recentPosts(account, since): Promise<AccountPost[]> {
      const items = await g.list(`${account.externalId}/published_posts`, account.credentials.pageAccessToken, {
        fields: 'id,message,created_time,permalink_url,status_type,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares',
        since: Math.floor(since.getTime() / 1000),
        limit: 50,
      }, (p) => new Date(String(p.created_time)).getTime() >= since.getTime());
      return items.map((p) => {
        const summary = (v: unknown) => num((v as { summary?: { total_count?: unknown } } | undefined)?.summary?.total_count);
        const detail = { reactions: summary(p.reactions), comments: summary(p.comments), shares: num((p.shares as { count?: unknown } | undefined)?.count) ?? 0 };
        return { externalId: String(p.id), publishedAt: new Date(String(p.created_time)), text: String(p.message ?? ''), permalink: typeof p.permalink_url === 'string' ? p.permalink_url : null, mediaType: typeof p.status_type === 'string' ? p.status_type : null, metrics: { engagements: total(Object.values(detail)), detail } };
      });
    },
    dailyInsights: (account, since, until) => facebookDaily((path, params) => g.query(path, account.credentials.pageAccessToken, params), account.externalId, since, until),
    demographics: (account) => facebookDemographics((path, params) => g.query(path, account.credentials.pageAccessToken, params), account.externalId),
    postInsights: (account, postId) => facebookPostInsights((path, params) => g.query(path, account.credentials.pageAccessToken, params), postId),
  };
}

/**
 * Instagram professional-account posting through the Graph API, using the access
 * token of the Facebook Page the Instagram account is linked to.
 */
export function instagramClient(fetchFn: FetchFn = fetch, sleep: Sleep = realSleep): PlatformClient<FacebookCredentials> {
  const g = graph(fetchFn, 'instagram');

  // A container must finish processing before it can be published; images usually are
  // ready at once, carousels can take a few seconds, videos up to a couple of minutes.
  async function waitReady(containerId: string, token: string, tries = 6) {
    for (let i = 0; i < tries; i++) {
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
      if (input.format === 'reel' || input.format === 'story') {
        const m = input.media[0];
        if (input.media.length !== 1 || !m) throw new PlatformError('instagram', 'invalid', `An Instagram ${input.format} takes exactly one media item`);
        if (input.format === 'reel' && m.type !== 'video') throw new PlatformError('instagram', 'invalid', 'An Instagram Reel needs a video');
        const source = m.type === 'video' ? { video_url: m.url } : { image_url: m.url };
        // Stories carry no caption; a Reel's caption is the post text, and it also shows in the feed.
        const fields = input.format === 'reel' ? { media_type: 'REELS', ...source, caption: input.body, share_to_feed: true } : { media_type: 'STORIES', ...source };
        const containerId = String((await g.post(`${igId}/media`, token, fields, true)).id);
        await waitReady(containerId, token, m.type === 'video' ? 12 : 6);
        const res = await g.post(`${igId}/media_publish`, token, { creation_id: containerId }, false);
        return { externalPostId: String(res.id) };
      }
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
    // Needs instagram_manage_comments.
    async comment(account, mediaId, text) {
      const res = await g.post(`${mediaId}/comments`, account.credentials.pageAccessToken, { message: text }, false);
      return { externalCommentId: String(res.id) };
    },
    // Reading and replying both need instagram_manage_comments.
    async comments(account, mediaId): Promise<PlatformComment[]> {
      const items = await g.list(`${mediaId}/comments`, account.credentials.pageAccessToken, { fields: 'id,text,timestamp,username,from{id},replies{id,text,timestamp,username,from{id}}', limit: 50 }, () => true, 4);
      const one = (c: Record<string, unknown>, parent: string | null): PlatformComment => ({
        externalId: String(c.id), parentExternalId: parent, author: String(c.username ?? '（沒有名稱）'), authorId: (c.from as { id?: string } | undefined)?.id ?? null,
        text: String(c.text ?? ''), createdAt: new Date(String(c.timestamp)),
      });
      return items.flatMap((c) => [one(c, null), ...((c.replies as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? []).map((r) => one(r, String(c.id)))]);
    },
    async reply(account, commentId, text) {
      const res = await g.post(`${commentId}/replies`, account.credentials.pageAccessToken, { message: text }, false);
      return { externalCommentId: String(res.id) };
    },
    async followers(account) {
      const res = await g.get(account.externalId, account.credentials.pageAccessToken, 'followers_count');
      return typeof res.followers_count === 'number' ? res.followers_count : null;
    },
    async metrics(account, mediaId): Promise<PostMetrics> {
      const res = await g.get(mediaId, account.credentials.pageAccessToken, 'like_count,comments_count');
      const detail = { likes: num(res.like_count), comments: num(res.comments_count) };
      return { engagements: total(Object.values(detail)), detail };
    },
    async recentPosts(account, since): Promise<AccountPost[]> {
      const items = await g.list(`${account.externalId}/media`, account.credentials.pageAccessToken, {
        fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
        limit: 50,
      }, (m) => new Date(String(m.timestamp)).getTime() >= since.getTime());
      return items.map((m) => {
        const detail = { likes: num(m.like_count), comments: num(m.comments_count) };
        return { externalId: String(m.id), publishedAt: new Date(String(m.timestamp)), text: String(m.caption ?? ''), permalink: typeof m.permalink === 'string' ? m.permalink : null, mediaType: typeof m.media_type === 'string' ? m.media_type : null, metrics: { engagements: total(Object.values(detail)), detail } };
      });
    },
    dailyInsights: (account, since, until) => instagramDaily((path, params) => g.query(path, account.credentials.pageAccessToken, params), account.externalId, since, until),
    demographics: (account) => instagramDemographics((path, params) => g.query(path, account.credentials.pageAccessToken, params), account.externalId),
    postInsights: (account, mediaId) => instagramPostInsights((path, params) => g.query(path, account.credentials.pageAccessToken, params), mediaId),
  };
}
