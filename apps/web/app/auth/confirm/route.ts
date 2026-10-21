import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

const TYPES: EmailOtpType[] = ['recovery', 'email', 'signup', 'invite', 'magiclink', 'email_change'];

/**
 * Sign in from a one-time `token_hash` link. Unlike the code in /auth/callback it works in
 * any browser, so it suits links handed over by an admin or sent by a custom email template.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const base = appUrl(req);
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  if (!tokenHash || !type || !TYPES.includes(type)) return NextResponse.redirect(`${base}/login?error=link`);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    console.error(`One-time link failed: ${error.message}`);
    return NextResponse.redirect(`${base}/login?error=link`);
  }
  return NextResponse.redirect(`${base}${type === 'recovery' ? '/reset-password' : '/app'}`);
}
