import 'server-only';
import { membershipFor } from '@kdan-social/core';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './server';
import { supabaseServer } from './supabase';

/** The signed-in user, or a redirect to /login. */
export async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return { id: data.user.id, email: data.user.email ?? '', emailConfirmed: !!data.user.email_confirmed_at };
}

// Which workspace a person last switched to. Only a hint: membershipFor ignores it
// unless they still belong there.
const WORKSPACE_COOKIE = 'kdan_ws';

export async function rememberWorkspace(workspaceId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 86_400 });
}

/**
 * The signed-in user and the workspace they are working in; null workspace when they
 * have not joined one. Invites are joined only through their link, since emails are
 * not verified at sign-up.
 */
export async function currentMember() {
  const user = await requireUser();
  const membership = await membershipFor(getDb(), user.id, (await cookies()).get(WORKSPACE_COOKIE)?.value);
  return { user, membership };
}

/** Like currentMember, but sends anyone without a workspace back to /app. */
export async function requireWorkspace() {
  const { user, membership } = await currentMember();
  if (!membership) redirect('/app');
  return { user, workspace: membership.workspace, role: membership.role };
}
