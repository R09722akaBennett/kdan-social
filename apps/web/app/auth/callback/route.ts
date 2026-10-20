import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

/** Finish the email login: trade the one-time code in the link for a session cookie. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  const base = appUrl(req);
  if (!code) return NextResponse.redirect(`${base}/login?error=link`);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error(`Login link exchange failed: ${error.message}`);
    return NextResponse.redirect(`${base}/login?error=link`);
  }
  return NextResponse.redirect(`${base}/app`);
}
