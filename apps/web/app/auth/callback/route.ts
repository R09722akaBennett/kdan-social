import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

// Facebook and Supabase errors, in words the person can act on.
function reason(raw: string) {
  if (/already linked|identity_already_exists/i.test(raw)) return '這個 Facebook 帳號已經用來登入另一個帳號，不能再連結到這裡。';
  if (/email/i.test(raw)) return '這個 Facebook 帳號沒有提供 Email。請到 Facebook 設定加入 Email，或在授權畫面允許分享 Email 後再試一次。';
  if (/access_denied/i.test(raw)) return '你在 Facebook 取消了授權。';
  return '沒有完成，請再試一次。';
}

/**
 * Finish a sign-in or a "連結 Facebook": trade the one-time code for a session cookie.
 *
 * Supabase sends errors back here as query parameters instead of a code. With `next`
 * (only paths inside /app), the person returns there; otherwise to the login page.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const base = appUrl(req);
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : null;
  const fail = (raw: string) => {
    console.error(`Auth callback failed: ${raw}`);
    return NextResponse.redirect(next ? `${base}${next}?error=${encodeURIComponent(reason(raw))}` : `${base}/login?error=link`);
  };
  const code = params.get('code');
  if (!code) return fail(`${params.get('error') ?? ''} ${params.get('error_description') ?? ''}`.trim() || 'no code');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);
  return NextResponse.redirect(`${base}${next ? `${next}?notice=${encodeURIComponent('已連結 Facebook，之後可以用 Facebook 登入。')}` : '/app'}`);
}
