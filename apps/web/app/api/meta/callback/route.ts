import { exchangeCodeForPages, loadKey, PlatformError, startMetaConnect } from '@kdan-social/core';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/auth';
import { appUrl, getDb, metaApp } from '@/lib/server';
import { META_STATE_COOKIE } from '@/lib/meta';

/** Receive Facebook's answer, read the granted Pages, and send the user to pick which to add. */
export async function GET(req: Request) {
  const { user, workspace } = await requireWorkspace();
  const params = new URL(req.url).searchParams;
  const base = appUrl(req);
  const store = await cookies();
  const expected = store.get(META_STATE_COOKIE)?.value;
  store.delete({ name: META_STATE_COOKIE, path: '/api/meta' });

  if (params.get('error')) return NextResponse.redirect(`${base}/app?notice=meta_cancelled`);
  const code = params.get('code');
  if (!code || !expected || params.get('state') !== expected) return NextResponse.redirect(`${base}/app?notice=meta_state`);

  try {
    const { pages, missing } = await exchangeCodeForPages(fetch, metaApp(req), code);
    if (pages.length === 0) return NextResponse.redirect(`${base}/app?notice=meta_no_pages`);
    const sessionId = await startMetaConnect(getDb(), loadKey(), { workspaceId: workspace.id, userId: user.id, pages });
    const q = new URLSearchParams({ session: sessionId, ...(missing.length ? { missing: missing.join(',') } : {}) });
    return NextResponse.redirect(`${base}/app/connect/meta?${q}`);
  } catch (e) {
    console.error(`Meta authorization failed for ${user.email}: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.redirect(`${base}/app?notice=${e instanceof PlatformError && e.kind === 'auth' ? 'meta_denied' : 'meta_failed'}`);
  }
}
