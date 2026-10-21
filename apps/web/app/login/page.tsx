import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/auth-forms';

const NOTICES: Record<string, string> = {
  link: '這個連結已經失效或用過了，請重新申請。',
};

/** Email and password, after Buffer's sign-in page; Facebook is only for connecting Pages. */
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; invite?: string }> }) {
  const { error, invite } = await searchParams;
  const q = invite ? `?invite=${encodeURIComponent(invite)}` : '';
  return (
    <AuthShell>
      <h1 className="auth-title">登入 kdan-social</h1>
      <p className="auth-alt" style={{ marginTop: 8 }}>還沒有帳號？<a href={`/signup${q}`}>建立帳號</a></p>
      {error && <div className="alert" role="alert" style={{ width: '100%', marginTop: 20 }}><div className="body small">{NOTICES[error] ?? '沒有完成，請再試一次。'}</div></div>}
      <LoginForm invite={invite} />
      <p className="tiny muted auth-legal">之前用 Facebook 登入的人：請按「忘記密碼？」為同一個 Email 設定密碼。</p>
    </AuthShell>
  );
}
