import 'server-only';
import { membershipFor } from '@kdan-social/core';
import { redirect } from 'next/navigation';
import { getDb } from './server';
import { supabaseServer } from './supabase';

/** The signed-in user, or a redirect to /login. */
export async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return { id: data.user.id, email: data.user.email ?? '' };
}

/** The signed-in user and their workspace; null workspace when they have not been added to one. */
export async function currentMember() {
  const user = await requireUser();
  const membership = await membershipFor(getDb(), user.id);
  return { user, membership };
}

/** Like currentMember, but sends anyone without a workspace back to /app. */
export async function requireWorkspace() {
  const { user, membership } = await currentMember();
  if (!membership) redirect('/app');
  return { user, workspace: membership.workspace, role: membership.role };
}
