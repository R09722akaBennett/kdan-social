export * from './crypto';
export * from './writes';
export * from './platforms/http';
export * from './platforms/types';
export { facebookClient, instagramClient, GRAPH_VERSION } from './platforms/meta';
export { lineClient, lineInsightDay, type LineClient, type LineQuota } from './platforms/line';
export { dispatchDue, MAX_ATTEMPTS, type Clients, type DispatchSummary } from './publish/dispatch';
export { snapshotFollowers, type SnapshotSummary } from './snapshot';

import { facebookClient, instagramClient } from './platforms/meta';
import { lineClient } from './platforms/line';
import type { Clients } from './publish/dispatch';

/** The real platform clients, all sharing one `fetch`. */
export function createClients(fetchFn: typeof fetch = fetch): Clients {
  return { facebook: facebookClient(fetchFn), instagram: instagramClient(fetchFn), line: lineClient(fetchFn) };
}
