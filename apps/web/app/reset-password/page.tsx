import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { ResetForm } from '@/components/auth-forms';
import { supabaseServer } from '@/lib/supabase';

/** Reached from the reset email, already signed in by its one-time code. */
export default async function ResetPassword() {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) redirect('/login?error=link');
  return (
    <AuthShell>
      <h1 className="auth-title">設定新密碼</h1>
      <p className="auth-alt" style={{ marginTop: 8 }}>{data.user.email}</p>
      <ResetForm />
    </AuthShell>
  );
}
