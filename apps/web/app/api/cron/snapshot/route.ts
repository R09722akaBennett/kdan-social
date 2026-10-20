import { collectInsights, collectPostMetrics, importAccountPosts, snapshotFollowers } from '@kdan-social/core';
import { deps, isCronRequest } from '@/lib/server';

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronRequest(req)) return new Response('Unauthorized', { status: 401 });
  const log = (line: string) => console.log(line);
  const followers = await snapshotFollowers({ ...deps(), log });
  const posts = await collectPostMetrics({ ...deps(), log });
  // Import before insights, so posts found tonight get their reach tonight too.
  const imported = await importAccountPosts({ ...deps(), log });
  const insights = await collectInsights({ ...deps(), log });
  return Response.json({ ...followers, posts, imported, insights });
}
