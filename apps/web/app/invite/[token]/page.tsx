import { inviteByToken } from '@kdan-social/core';
import { AuthShell } from '@/components/auth-shell';
import { ROLE_TEXT } from '@/components/roles';
import { getDb } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';
import { joinInviteAction } from '@/app/app/actions';

/** Where an invite link lands: who invited you to what, then join, sign in or sign up. */
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, { data }] = await Promise.all([inviteByToken(getDb(), token), (await supabaseServer()).auth.getUser()]);
  if (!invite) {
    return (
      <AuthShell>
        <h1 className="auth-title">這個邀請連結已經失效</h1>
        <p className="auth-alt" style={{ marginTop: 8 }}>可能已經用過，或被撤回了。請邀請你的人再傳一次。</p>
        <p className="auth-alt"><a href="/login">前往登入</a></p>
      </AuthShell>
    );
  }
  const q = `?invite=${token}`;
  return (
    <AuthShell>
      <h1 className="auth-title">加入「{invite.workspace}」</h1>
      <p className="auth-alt" style={{ marginTop: 8 }}>{invite.invitedBy} 邀請你以<strong>{ROLE_TEXT[invite.role]?.name}</strong>的身分加入。{ROLE_TEXT[invite.role]?.detail}。</p>
      {data.user ? (
        <form action={joinInviteAction} style={{ width: '100%', marginTop: 24 }}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="btn btn-primary auth-submit">以 {data.user.email} 加入</button>
        </form>
      ) : (
        <div className="auth-fields">
          <a className="btn btn-primary auth-submit" href={`/signup${q}`}>建立帳號並加入</a>
          <a className="btn auth-submit" href={`/login${q}`}>我已經有帳號，登入後加入</a>
        </div>
      )}
      <p className="tiny muted auth-legal">邀請連結只能用一次，請不要轉傳給其他人。</p>
    </AuthShell>
  );
}
