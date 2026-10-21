import { describe, expect, it } from 'vitest';
import { mask, PlatformError } from '../src/platforms/http';
import { lineClient, lineInsightDay } from '../src/platforms/line';
import { facebookClient, instagramClient } from '../src/platforms/meta';
import { fakeFetch } from './helpers';

const fbAccount = { externalId: 'page-1', credentials: { pageAccessToken: 'tok' } };
const igAccount = { externalId: 'ig-1', credentials: { pageAccessToken: 'tok' } };
const lineAccount = { externalId: 'line-1', credentials: { channelId: '2001', channelSecret: 'shh' } };
const input = (media: { url: string; alt?: string; type?: 'image' | 'video' }[] = []) => ({ body: 'hello', media, idempotencyKey: '7f3c1d2e-0000-4000-8000-000000000001' });
const noSleep = async () => {};

async function rejects(p: Promise<unknown>): Promise<PlatformError> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(PlatformError);
  return e as PlatformError;
}

describe('mask', () => {
  it('hides tokens in query strings and auth headers', () => {
    expect(mask('GET /me?access_token=EAAB123&fields=id')).toBe('GET /me?access_token=***&fields=id');
    expect(mask('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer ***');
  });
});

describe('facebook', () => {
  it('posts text to the feed with the token in the body, not the URL', async () => {
    const f = fakeFetch().on('POST', /page-1\/feed$/, { body: { id: 'page-1_99' } });
    const res = await facebookClient(f.fn).publish(fbAccount, input());
    expect(res.externalPostId).toBe('page-1_99');
    expect(f.calls[0]!.url).not.toContain('tok');
    expect(new URLSearchParams(f.calls[0]!.body).get('access_token')).toBe('tok');
  });

  it('uploads several photos unpublished, then attaches them to one post', async () => {
    const f = fakeFetch()
      .on('POST', /page-1\/photos$/, { body: { id: 'p1' } }, { body: { id: 'p2' } })
      .on('POST', /page-1\/feed$/, { body: { id: 'page-1_100' } });
    await facebookClient(f.fn).publish(fbAccount, input([{ url: 'https://cdn/a.jpg' }, { url: 'https://cdn/b.jpg' }]));
    const feed = new URLSearchParams(f.calls[2]!.body);
    expect(new URLSearchParams(f.calls[0]!.body).get('published')).toBe('false');
    expect(feed.get('attached_media[1]')).toBe('{"media_fbid":"p2"}');
  });

  it('classifies an expired token as auth', async () => {
    const f = fakeFetch().on('POST', /feed$/, { status: 400, body: { error: { code: 190, message: 'Error validating access token' } } });
    expect((await rejects(facebookClient(f.fn).publish(fbAccount, input()))).kind).toBe('auth');
  });

  it('treats a 5xx on publish as unknown outcome, never as safe to retry', async () => {
    const f = fakeFetch().on('POST', /feed$/, { status: 500, body: { error: { code: 2 } } });
    expect((await rejects(facebookClient(f.fn).publish(fbAccount, input()))).kind).toBe('unknown_outcome');
  });

  it('treats a dropped connection on publish as unknown outcome', async () => {
    const f = fakeFetch().on('POST', /feed$/, new TypeError('fetch failed'));
    expect((await rejects(facebookClient(f.fn).publish(fbAccount, input()))).kind).toBe('unknown_outcome');
  });

  it('classifies throttling as rate_limited', async () => {
    const f = fakeFetch().on('POST', /feed$/, { status: 400, body: { error: { code: 32 } } });
    expect((await rejects(facebookClient(f.fn).publish(fbAccount, input()))).kind).toBe('rate_limited');
  });
});

describe('instagram', () => {
  it('creates a container with alt text, waits for it, then publishes', async () => {
    const f = fakeFetch()
      .on('POST', /ig-1\/media$/, { body: { id: 'c1' } })
      .on('GET', /\/c1\?/, { body: { status_code: 'IN_PROGRESS' } }, { body: { status_code: 'FINISHED' } })
      .on('POST', /ig-1\/media_publish$/, { body: { id: 'ig-post-1' } });
    const res = await instagramClient(f.fn, noSleep).publish(igAccount, input([{ url: 'https://cdn/a.jpg', alt: 'A cake' }]));
    expect(res.externalPostId).toBe('ig-post-1');
    expect(new URLSearchParams(f.calls[0]!.body).get('alt_text')).toBe('A cake');
    expect(f.calls.map((c) => c.method)).toEqual(['POST', 'GET', 'GET', 'POST']);
  });

  it('builds a carousel from child containers', async () => {
    const f = fakeFetch()
      .on('POST', /ig-1\/media$/, { body: { id: 'k1' } }, { body: { id: 'k2' } }, { body: { id: 'carousel' } })
      .on('GET', /\/carousel\?/, { body: { status_code: 'FINISHED' } })
      .on('POST', /media_publish$/, { body: { id: 'ig-post-2' } });
    await instagramClient(f.fn, noSleep).publish(igAccount, input([{ url: 'https://cdn/a.jpg' }, { url: 'https://cdn/b.jpg' }]));
    const parent = new URLSearchParams(f.calls[2]!.body);
    expect(parent.get('media_type')).toBe('CAROUSEL');
    expect(parent.get('children')).toBe('k1,k2');
  });

  it('publishes a Reel from one video with its caption, shared to the feed', async () => {
    const f = fakeFetch()
      .on('POST', /ig-1\/media$/, { body: { id: 'r1' } })
      .on('GET', /\/r1\?/, { body: { status_code: 'IN_PROGRESS' } }, { body: { status_code: 'FINISHED' } })
      .on('POST', /media_publish$/, { body: { id: 'ig-reel' } });
    const res = await instagramClient(f.fn, noSleep).publish(igAccount, { ...input([{ url: 'https://cdn/a.mp4', type: 'video' }]), format: 'reel' });
    expect(res.externalPostId).toBe('ig-reel');
    const container = new URLSearchParams(f.calls[0]!.body);
    expect([container.get('media_type'), container.get('video_url'), container.get('share_to_feed'), container.get('caption')]).toEqual(['REELS', 'https://cdn/a.mp4', 'true', input().body]);
  });

  it('publishes a story from one image without a caption, and refuses a Reel without video', async () => {
    const f = fakeFetch()
      .on('POST', /ig-1\/media$/, { body: { id: 's1' } })
      .on('GET', /\/s1\?/, { body: { status_code: 'FINISHED' } })
      .on('POST', /media_publish$/, { body: { id: 'ig-story' } });
    await instagramClient(f.fn, noSleep).publish(igAccount, { ...input([{ url: 'https://cdn/a.jpg' }]), format: 'story' });
    const container = new URLSearchParams(f.calls[0]!.body);
    expect([container.get('media_type'), container.get('image_url'), container.get('caption')]).toEqual(['STORIES', 'https://cdn/a.jpg', null]);
    const g = fakeFetch();
    expect((await rejects(instagramClient(g.fn, noSleep).publish(igAccount, { ...input([{ url: 'https://cdn/a.jpg' }]), format: 'reel' }))).kind).toBe('invalid');
    expect(g.calls).toHaveLength(0);
  });

  it('rejects a post without images before calling the API', async () => {
    const f = fakeFetch();
    expect((await rejects(instagramClient(f.fn, noSleep).publish(igAccount, input()))).kind).toBe('invalid');
    expect(f.calls).toHaveLength(0);
  });

  it('stops when Instagram reports the media failed processing', async () => {
    const f = fakeFetch().on('POST', /media$/, { body: { id: 'c1' } }).on('GET', /c1/, { body: { status_code: 'ERROR' } });
    expect((await rejects(instagramClient(f.fn, noSleep).publish(igAccount, input([{ url: 'https://cdn/a.jpg' }])))).kind).toBe('invalid');
    expect(f.calls.some((c) => c.url.includes('media_publish'))).toBe(false);
  });
});

describe('line', () => {
  const tokenRoute = [/oauth2\/v3\/token$/, { body: { access_token: 'stateless', expires_in: 900 } }] as const;

  it('broadcasts text and images with a retry key', async () => {
    const f = fakeFetch().on('POST', ...tokenRoute).on('POST', /broadcast$/, { body: {}, headers: { 'x-line-request-id': 'req-1' } });
    const res = await lineClient(f.fn).publish(lineAccount, input([{ url: 'https://cdn/a.jpg' }]));
    const send = f.calls[1]!;
    expect(res.externalPostId).toBe('req-1');
    expect(send.headers['x-line-retry-key']).toBe('7f3c1d2e-0000-4000-8000-000000000001');
    expect(send.headers.authorization).toBe('Bearer stateless');
    expect(JSON.parse(send.body).messages.map((m: { type: string }) => m.type)).toEqual(['text', 'image']);
  });

  it('treats 409 for a reused retry key as already sent', async () => {
    const f = fakeFetch().on('POST', ...tokenRoute).on('POST', /broadcast$/, { status: 409, body: { message: 'The retry key is already accepted' } });
    expect((await lineClient(f.fn).publish(lineAccount, input())).externalPostId).toBe('7f3c1d2e-0000-4000-8000-000000000001');
  });

  it('reports wrong channel credentials as auth', async () => {
    const f = fakeFetch().on('POST', /oauth2\/v3\/token$/, { status: 400, body: { error: 'invalid_client' } });
    expect((await rejects(lineClient(f.fn).publish(lineAccount, input()))).kind).toBe('auth');
  });

  it('retries a broadcast 5xx safely because of the retry key', async () => {
    const f = fakeFetch().on('POST', ...tokenRoute).on('POST', /broadcast$/, { status: 500, body: {} });
    expect((await rejects(lineClient(f.fn).publish(lineAccount, input()))).kind).toBe('transient');
  });

  it('reads quota and this month’s usage', async () => {
    const f = fakeFetch()
      .on('POST', ...tokenRoute)
      .on('GET', /quota\/consumption$/, { body: { totalUsage: 3200 } })
      .on('GET', /quota$/, { body: { type: 'limited', value: 5000 } });
    expect(await lineClient(f.fn).quota(lineAccount)).toEqual({ limit: 5000, used: 3200 });
  });

  it('asks insight for yesterday in Japan time', () => {
    // 2026-10-20 16:00 UTC is 10-21 01:00 in Japan, so "yesterday" there is 10-20.
    expect(lineInsightDay(new Date('2026-10-20T16:00:00Z'))).toBe('20261020');
    expect(lineInsightDay(new Date('2026-10-20T14:00:00Z'))).toBe('20261019');
  });

  it('returns null while insight is not ready', async () => {
    const f = fakeFetch().on('POST', ...tokenRoute).on('GET', /insight\/followers/, { body: { status: 'unready' } });
    expect(await lineClient(f.fn).followers(lineAccount, new Date())).toBeNull();
  });
});
