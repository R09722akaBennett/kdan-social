'use server';

import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect('/login?error=email');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${appUrl()}/auth/callback` } });
  if (error) {
    console.error(`Login link for ${email} failed: ${error.message}`);
    redirect(`/login?error=${error.status === 429 ? 'rate' : 'send'}`);
  }
  redirect(`/login?sent=${encodeURIComponent(email)}`);
}
