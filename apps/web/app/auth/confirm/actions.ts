'use server';

import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { OTP_TYPES } from '@/lib/otp';
import { supabaseServer } from '@/lib/supabase';

/** Spend a one-time `token_hash` link and sign in with it. */
export async function confirmAction(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') ?? '');
  const type = String(formData.get('type') ?? '') as EmailOtpType;
  if (!tokenHash || !OTP_TYPES.includes(type)) redirect('/login?error=link');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    console.error(`One-time link failed: ${error.message}`);
    redirect('/login?error=link');
  }
  redirect(type === 'recovery' ? '/reset-password' : '/app');
}
