import { snapshotFollowers } from '@kdan-social/core';
import { deps, isCronRequest } from '@/lib/server';

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronRequest(req)) return new Response('Unauthorized', { status: 401 });
  const summary = await snapshotFollowers({ ...deps(), log: (line) => console.log(line) });
  return Response.json(summary);
}
