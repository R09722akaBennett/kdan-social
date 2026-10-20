import { metaLoginUrl } from '@kdan-social/core';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/auth';
import { META_STATE_COOKIE } from '@/lib/meta';
import { metaApp } from '@/lib/server';

/** Send a workspace member to Facebook to grant access to their Pages. */
export async function GET(req: Request) {
  await requireWorkspace();
  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(metaLoginUrl(metaApp(req), state));
  // The callback only accepts a `state` matching this cookie, so a link forged by
  // someone else cannot attach their Pages to this user's workspace.
  res.cookies.set(META_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/meta', maxAge: 600 });
  return res;
}
