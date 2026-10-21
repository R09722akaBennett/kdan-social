import { AuthShell } from '@/components/auth-shell';
import { SignupForm } from '@/components/auth-forms';

/** Create an account, after Buffer's: email, a password whose rules tick as they are met. */
export default async function Signup({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return (
    <AuthShell>
      <h1 className="auth-title">建立帳號</h1>
      <p className="auth-alt" style={{ marginTop: 8 }}>已經有帳號了？<a href={`/login${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`}>登入</a></p>
      <SignupForm invite={invite} />
      <p className="tiny muted auth-legal">{invite ? '建立帳號後會直接加入邀請你的工作區。' : '建立帳號後，接下來幾個問題可以略過。'}</p>
    </AuthShell>
  );
}
