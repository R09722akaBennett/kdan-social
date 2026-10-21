import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Finish the Facebook sign-in: trade the one-time code for a session cookie.
 *
 * Supabase sends errors back here as query parameters instead of a code: the person
 * cancelled, or Facebook returned no email (accounts registered with a phone number).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const base = appUrl(req);
  const code = params.get('code');
  if (!code) {
    const why = `${params.get('error') ?? ''} ${params.get('error_description') ?? ''}`.trim();
    console.error(`Facebook sign-in returned an error: ${why || 'no code'}`);
    const kind = /email/i.test(why) ? 'no_email' : /access_denied/i.test(why) ? 'cancelled' : 'failed';
    return NextResponse.redirect(`${base}/login?error=${kind}`);
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error(`Sign-in code exchange failed: ${error.message}`);
    return NextResponse.redirect(`${base}/login?error=failed`);
  }
  return NextResponse.redirect(`${base}/app`);
}
