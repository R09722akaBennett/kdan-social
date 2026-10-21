import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

// Only these may follow a sign-in code, so the link cannot send anyone off-site.
const safeNext = (next: string | null) => (next === '/reset-password' || next?.startsWith('/app') ? next : '/app');

/**
 * Finish a password-reset link: trade its one-time code for a session cookie, then go on
 * to `next`. The code only works in the browser that asked for the email.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const base = appUrl(req);
  const code = params.get('code');
  if (!code) {
    console.error(`Auth callback without a code: ${params.get('error_description') ?? params.get('error') ?? 'none'}`);
    return NextResponse.redirect(`${base}/login?error=link`);
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error(`Auth code exchange failed: ${error.message}`);
    return NextResponse.redirect(`${base}/login?error=link`);
  }
  return NextResponse.redirect(`${base}${safeNext(params.get('next'))}`);
}
