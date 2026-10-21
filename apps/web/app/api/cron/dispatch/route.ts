import { dispatchDue, globalPublishingEnabled } from '@kdan-social/core';
import { deps, isCronRequest } from '@/lib/server';

// Called every minute by Supabase Cron (docs/deploy.md), not Vercel Cron: the Hobby
// plan only runs Vercel Cron once a day. Instagram can take over two minutes to process a
// Reel; a run cut off mid-wait leaves its task stuck as running.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronRequest(req)) return new Response('Unauthorized', { status: 401 });
  const summary = await dispatchDue({ ...deps(), globalEnabled: globalPublishingEnabled(), log: (line) => console.log(line) });
  return Response.json(summary);
}
