import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { OTP_TYPES } from '@/lib/otp';
import { confirmAction } from './actions';

const TEXT: Partial<Record<EmailOtpType, [string, string]>> = {
  recovery: ['設定新密碼', '繼續設定密碼'],
  signup: ['確認你的 Email', '完成確認'],
  email: ['確認你的 Email', '完成確認'],
  email_change: ['確認新的 Email', '完成確認'],
};

/**
 * Where one-time email links land. The link is spent only when the button is pressed:
 * mail scanners such as Outlook's Safe Links open every link in a message before the
 * person does, and a link spent on page load was used up by the time they clicked it.
 * Unlike the code in /auth/callback, a `token_hash` works in any browser.
 */
export default async function Confirm({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash: tokenHash, type } = await searchParams;
  if (!tokenHash || !OTP_TYPES.includes(type as EmailOtpType)) redirect('/login?error=link');
  const [title, button] = TEXT[type as EmailOtpType] ?? ['登入 kdan-social', '繼續'];
  return (
    <AuthShell>
      <h1 className="auth-title">{title}</h1>
      <form action={confirmAction} className="auth-fields">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <button type="submit" className="btn btn-primary auth-submit">{button}</button>
      </form>
      <p className="tiny muted auth-legal">連結只能用一次，請不要轉傳給其他人。</p>
    </AuthShell>
  );
}
