// Insights for Facebook Pages and Instagram business accounts, metric by metric, so one
// metric Meta withholds (too few followers, a scope not granted, a renamed metric) costs
// that number only. Every refusal becomes an issue; expiry is the follower snapshot's job.
import { PlatformError } from './http';
import type { DailyMetrics, Demographic, InsightIssue, PostInsights, WithIssues } from './types';

type Query = (path: string, params: Record<string, string | number>) => Promise<{ data?: Array<Record<string, any>> }>;

const DAY = 86_400_000;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

async function attempt<T>(issues: InsightIssue[], metric: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof PlatformError)) throw e;
    issues.push({ metric, message: e.message.slice(0, 200) });
    return null;
  }
}

/** Days in [since, until) as yyyy-mm-dd, oldest first. */
function days(since: Date, until: Date) {
  const out: string[] = [];
  for (let t = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()); t < until.getTime(); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// Our names on the left, Graph's on the right. Impressions were retired in 2025; these are their replacements.
const FB_DAILY: Record<string, string> = {
  views: 'page_media_view',
  reach: 'page_total_media_view_unique',
  engagements: 'page_post_engagements',
  follows: 'page_daily_follows_unique',
  unfollows: 'page_daily_unfollows_unique',
};

export async function facebookDaily(q: Query, pageId: string, since: Date, until: Date): Promise<WithIssues<DailyMetrics[]>> {
  const issues: InsightIssue[] = [];
  const byDay = new Map(days(since, until).map((d) => [d, {} as Record<string, number | null>]));
  for (const [ours, graph] of Object.entries(FB_DAILY)) {
    const res = await attempt(issues, graph, () => q(`${pageId}/insights`, { metric: graph, period: 'day', since: unix(since), until: unix(until) }));
    for (const v of res?.data?.[0]?.values ?? []) {
      // `end_time` marks the end of the day the value covers.
      const day = new Date(new Date(String(v.end_time)).getTime() - DAY).toISOString().slice(0, 10);
      const m = byDay.get(day);
      if (m) m[ours] = num(v.value);
    }
  }
  return { value: [...byDay].filter(([, m]) => Object.keys(m).length).map(([day, metrics]) => ({ day, metrics })), issues };
}

export async function facebookDemographics(q: Query, pageId: string): Promise<WithIssues<Demographic[]>> {
  const issues: InsightIssue[] = [];
  const out: Demographic[] = [];
  for (const [kind, metric] of [['country', 'page_follows_country'], ['city', 'page_follows_city']] as const) {
    const res = await attempt(issues, metric, () => q(`${pageId}/insights`, { metric, period: 'day' }));
    const value = res?.data?.[0]?.values?.at(-1)?.value;
    if (value && typeof value === 'object') {
      out.push({ kind, unit: 'count', items: Object.entries(value as Record<string, number>).map(([key, v]) => ({ key, value: v })).sort((a, b) => b.value - a.value).slice(0, 20) });
    }
  }
  return { value: out, issues };
}

export async function facebookPostInsights(q: Query, postId: string): Promise<WithIssues<PostInsights>> {
  const issues: InsightIssue[] = [];
  const one = async (metric: string) => (await attempt(issues, metric, () => q(`${postId}/insights`, { metric, period: 'lifetime' })))?.data?.[0]?.values?.[0]?.value;
  const views = num(await one('post_media_view'));
  const reach = num(await one('post_total_media_view_unique'));
  const reactions = await one('post_reactions_by_type_total');
  const detail = reactions && typeof reactions === 'object' ? Object.fromEntries(Object.entries(reactions as Record<string, unknown>).map(([k, v]) => [`reaction_${k}`, num(v)])) : {};
  return { value: { reach, views, detail }, issues };
}

const IG_DAILY: Record<string, string> = {
  reach: 'reach',
  views: 'views',
  engagedAccounts: 'accounts_engaged',
  engagements: 'total_interactions',
  profileLinkTaps: 'profile_links_taps',
};

export async function instagramDaily(q: Query, igId: string, since: Date, until: Date): Promise<WithIssues<DailyMetrics[]>> {
  const issues: InsightIssue[] = [];
  const failed = new Set<string>();
  const out: DailyMetrics[] = [];
  for (const day of days(since, until)) {
    const start = new Date(`${day}T00:00:00Z`);
    const range = { period: 'day', metric_type: 'total_value', since: unix(start), until: unix(new Date(start.getTime() + DAY)) };
    const metrics: Record<string, number | null> = {};
    for (const [ours, graph] of Object.entries(IG_DAILY)) {
      // A metric refused once is refused for every day; asking again only burns calls.
      if (failed.has(graph)) continue;
      const res = await attempt(issues, graph, () => q(`${igId}/insights`, { metric: graph, ...range }));
      if (!res) { failed.add(graph); continue; }
      metrics[ours] = num(res.data?.[0]?.total_value?.value);
    }
    if (!failed.has('follows_and_unfollows')) {
      const res = await attempt(issues, 'follows_and_unfollows', () => q(`${igId}/insights`, { metric: 'follows_and_unfollows', breakdown: 'follow_type', ...range }));
      if (!res) failed.add('follows_and_unfollows');
      for (const r of res?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
        if (r.dimension_values?.[0] === 'FOLLOWER') metrics.follows = num(r.value);
        if (r.dimension_values?.[0] === 'NON_FOLLOWER') metrics.unfollows = num(r.value);
      }
    }
    if (Object.keys(metrics).length) out.push({ day, metrics });
  }
  return { value: out, issues };
}

export async function instagramDemographics(q: Query, igId: string): Promise<WithIssues<Demographic[]>> {
  const issues: InsightIssue[] = [];
  const out: Demographic[] = [];
  for (const kind of ['age', 'gender', 'country', 'city'] as const) {
    // Meta withholds these below 100 followers; that shows up here as an issue.
    const res = await attempt(issues, `follower_demographics:${kind}`, () => q(`${igId}/insights`, { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', timeframe: 'this_month', breakdown: kind }));
    const results = res?.data?.[0]?.total_value?.breakdowns?.[0]?.results as Array<{ dimension_values?: string[]; value?: number }> | undefined;
    if (results?.length) out.push({ kind, unit: 'count', items: results.map((r) => ({ key: String(r.dimension_values?.[0] ?? ''), value: r.value ?? 0 })).sort((a, b) => b.value - a.value).slice(0, 20) });
  }
  return { value: out, issues };
}

const IG_MEDIA = ['reach', 'views', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits'];

export async function instagramPostInsights(q: Query, mediaId: string): Promise<WithIssues<PostInsights>> {
  const issues: InsightIssue[] = [];
  const values: Record<string, number | null> = {};
  // One call when every metric applies; reels and stories reject some, so fall back to one by one.
  const all = await attempt([], 'media', () => q(`${mediaId}/insights`, { metric: IG_MEDIA.join(',') }));
  if (all) {
    for (const d of all.data ?? []) values[String(d.name)] = num(d.values?.[0]?.value ?? d.total_value?.value);
  } else {
    for (const m of IG_MEDIA) {
      const res = await attempt(issues, m, () => q(`${mediaId}/insights`, { metric: m }));
      if (res) values[m] = num(res.data?.[0]?.values?.[0]?.value ?? res.data?.[0]?.total_value?.value);
    }
  }
  const { reach = null, views = null, ...detail } = values;
  return { value: { reach, views, detail }, issues };
}
