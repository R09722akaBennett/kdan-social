import { AuthShell } from '@/components/auth-shell';
import { ForgotForm } from '@/components/auth-forms';

export default function ForgotPassword() {
  return (
    <AuthShell>
      <h1 className="auth-title">重設密碼</h1>
      <p className="auth-alt" style={{ marginTop: 8 }}>輸入註冊用的 Email，我們會寄一封重設密碼的信給你。</p>
      <ForgotForm />
      <p className="auth-alt"><a href="/login">回到登入</a></p>
    </AuthShell>
  );
}
