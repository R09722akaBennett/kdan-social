import { canManageMembers, formatInZone, listInvites, listMembers } from '@kdan-social/core';
import { ConfirmButton, CopyLinkButton, InviteButton, RoleSelect } from '@/components/members';
import { ROLE_TEXT } from '@/components/roles';
import { requireWorkspace } from '@/lib/auth';
import { appUrl, getDb } from '@/lib/server';
import { changeRoleAction, inviteAction, removeMemberAction, revokeInviteAction } from '@/app/app/actions';
import { NoticeToast } from '@/components/toast';

// After Buffer's Team Members (list with Owner / You tags) and User Interviews' pending invites.
export default async function Members({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { user, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const db = getDb();
  const [members, invites] = await Promise.all([listMembers(db, workspace.id), listInvites(db, workspace.id)]);
  const manager = canManageMembers(role);
  const base = appUrl();
  const tz = workspace.timeZone;

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>成員</h1>
          <div className="sub">誰可以進入 {workspace.name}，以及各自能做什麼。</div>
        </div>
        {manager && <InviteButton action={inviteAction} />}
      </header>

      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}
      {sp.notice && <NoticeToast text={sp.notice} />}

      <section className="card" aria-labelledby="h-members">
        <div className="card-head"><h2 id="h-members">成員 <span className="small muted">{members.length}</span></h2></div>
        {members.map((m) => {
          const me = m.userId === user.id;
          return (
            <div key={m.userId} className="list-row">
              <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--line-soft)', color: 'var(--ink-2)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{m.email.slice(0, 1).toUpperCase()}</span>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>{m.email}</span>
                  {m.role === 'owner' && <span className="mk">擁有者</span>}
                  {me && <span className="mk">你</span>}
                </div>
                <div className="small muted">{ROLE_TEXT[m.role]!.detail} · {formatInZone(m.createdAt, tz)} 加入</div>
              </div>
              {manager && !me && m.role !== 'owner'
                ? <>
                    <RoleSelect userId={m.userId} email={m.email} value={m.role} action={changeRoleAction} />
                    <ConfirmButton action={removeMemberAction} field="userId" value={m.userId} label={`移除 ${m.email}`} question={`把 ${m.email} 移出工作區？對方寫過的貼文與紀錄會保留。`} />
                  </>
                : <span className="small" style={{ color: 'var(--ink-2)' }}>{ROLE_TEXT[m.role]!.name}</span>}
            </div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="h-invites">
        <div className="card-head">
          <div>
            <h2 id="h-invites">待接受的邀請 <span className="small muted">{invites.length}</span></h2>
            <div className="small muted">每個邀請都有自己的連結，複製後傳給對方；對方打開連結建立帳號或登入就會加入，連結用過一次就失效。</div>
          </div>
        </div>
        {invites.length === 0 && <div className="list-row small muted">沒有待接受的邀請。</div>}
        {invites.map((i) => (
          <div key={i.id} className="list-row">
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{i.email}</div>
              <div className="small muted">{ROLE_TEXT[i.role]!.name} · {i.invitedBy} 於 {formatInZone(i.createdAt, tz)} 邀請</div>
            </div>
            <CopyLinkButton url={`${base}/invite/${i.token}`} />
            {manager && <ConfirmButton action={revokeInviteAction} field="inviteId" value={i.id} label={`撤回對 ${i.email} 的邀請`} question={`撤回對 ${i.email} 的邀請？`} />}
          </div>
        ))}
      </section>
    </main>
  );
}
