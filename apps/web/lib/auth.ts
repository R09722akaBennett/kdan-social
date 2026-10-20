import 'server-only';
import { acceptInvite, membershipFor } from '@kdan-social/core';
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

/**
 * The signed-in user and their workspace; null workspace when they have not been added to one.
 *
 * Someone without a workspace joins the one that invited their email, if any. Only a
 * confirmed email counts, since the invite trusts the address to be theirs.
 */
export async function currentMember() {
  const user = await requireUser();
  const db = getDb();
  let membership = await membershipFor(db, user.id);
  if (!membership && user.emailConfirmed && user.email) membership = await acceptInvite(db, { userId: user.id, email: user.email });
  return { user, membership };
}

/** Like currentMember, but sends anyone without a workspace back to /app. */
export async function requireWorkspace() {
  const { user, membership } = await currentMember();
  if (!membership) redirect('/app');
  return { user, workspace: membership.workspace, role: membership.role };
}
