import 'server-only';
import { acceptInvite, membershipFor } from '@kdan-social/core';
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
 * have not been added to one.
 *
 * Pending invites for their email are accepted first, so being invited to a second
 * workspace adds it to the switcher on the next page load. Only a confirmed email
 * counts, since the invite trusts the address to be theirs.
 */
export async function currentMember() {
  const user = await requireUser();
  const db = getDb();
  if (user.emailConfirmed && user.email) await acceptInvite(db, { userId: user.id, email: user.email });
  const membership = await membershipFor(db, user.id, (await cookies()).get(WORKSPACE_COOKIE)?.value);
  return { user, membership };
}

/** Like currentMember, but sends anyone without a workspace back to /app. */
export async function requireWorkspace() {
  const { user, membership } = await currentMember();
  if (!membership) redirect('/app');
  return { user, workspace: membership.workspace, role: membership.role };
}
