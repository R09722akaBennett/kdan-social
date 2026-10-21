'use server';

import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Send the person to Facebook to sign in. Only their name and email are asked for:
 * the email is how invites, notifications and the activity log know them, and Page
 * access is a separate grant on the accounts page.
 */
export async function signInWithFacebook() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: { redirectTo: `${appUrl()}/auth/callback`, scopes: 'email' },
  });
  if (error || !data.url) {
    console.error(`Facebook sign-in could not start: ${error?.message ?? 'no URL returned'}`);
    redirect('/login?error=start');
  }
  redirect(data.url);
}
