export * from './crypto';
export * from './writes';
export * from './platforms/http';
export * from './platforms/types';
export { facebookClient, instagramClient, GRAPH_VERSION } from './platforms/meta';
export { lineClient, lineInsightDay, type LineAudience, type LineBotInfo, type LineClient, type LineQuota } from './platforms/line';
export { dispatchDue, MAX_ATTEMPTS, type Clients, type DispatchSummary } from './publish/dispatch';
export { collectInsights, collectPostMetrics, IMPORT_WINDOW_DAYS, importAccountPosts, snapshotFollowers, type ImportSummary, type InsightsSummary, type MetricsSummary, type SnapshotSummary } from './snapshot';

import { facebookClient, instagramClient } from './platforms/meta';
import { lineClient } from './platforms/line';
import type { Clients } from './publish/dispatch';

/** The real platform clients, all sharing one `fetch`. */
export function createClients(fetchFn: typeof fetch = fetch): Clients {
  return { facebook: facebookClient(fetchFn), instagram: instagramClient(fetchFn), line: lineClient(fetchFn) };
}
export { META_SCOPES, OPTIONAL_META_SCOPES, metaLoginUrl, exchangeCodeForPages, type MetaApp, type MetaGrant, type MetaPage } from './platforms/meta-oauth';
export * from './workspace';
export * from './posts';
export * from './channel';
export * from './ideas';
export * from './tags';
export * from './goals';
export * from './inbox';
export * from './time';
export * from './overview';
export * from './groups';
export * from './review';
export * from './members';
export * from './voice';
export * from './voice-rules';
export * from './ai/index';
export * from './analytics';
export * from './onboarding';
export * from './notifications';
