'use client';

import { useEffect, useState } from 'react';
import { Icon } from './ui';
import { ROLE_TEXT } from './roles';


/** Invite dialog after Buffer's "Invite Team Member": an email and a role, each role explained. */
export function InviteButton({ action }: { action: (f: FormData) => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('editor');
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="plus" size={16} stroke={2} />邀請成員</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="invite-title" style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,30,.35)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form action={action} className="card" style={{ width: 'min(460px, 100%)', display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ padding: '16px 18px', justifyContent: 'space-between' }}>
              <h2 id="invite-title">邀請成員</h2>
              <button type="button" className="btn icon-btn" aria-label="關閉" onClick={() => setOpen(false)} style={{ border: 0, width: 32, height: 32, minHeight: 32 }}><Icon name="close" size={16} /></button>
            </div>
            <div className="stack" style={{ padding: '0 18px', gap: 14 }}>
              <div className="field">
                <label htmlFor="inv-email">Email</label>
                <input id="inv-email" name="email" type="email" className="input" required autoFocus placeholder="name@company.com" />
              </div>
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label">角色</legend>
                {(['editor', 'admin'] as const).map((r) => (
                  <label key={r} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${role === r ? 'var(--accent)' : 'var(--line)'}`, background: role === r ? '#F7F9FF' : '#fff' }}>
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} style={{ accentColor: 'var(--accent)', marginTop: 3 }} />
                    <span><span style={{ display: 'block', fontWeight: 600 }}>{ROLE_TEXT[r]!.name}</span><span className="small" style={{ color: 'var(--ink-2)' }}>{ROLE_TEXT[r]!.detail}</span></span>
                  </label>
                ))}
              </fieldset>
              <p className="tiny muted" style={{ margin: 0 }}>目前不會自動寄信。邀請後請把登入連結傳給對方，對方用 Email 是這個地址的 Facebook 帳號登入就會加入。</p>
            </div>
            <div className="row" style={{ padding: '14px 18px', justifyContent: 'flex-end', borderTop: '1px solid var(--line-soft)', marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>取消</button>
              <button type="submit" className="btn btn-primary">邀請</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Copy the sign-in link to hand to an invitee, as Krea's pending-invite "Copy link". */
export function CopyLinkButton({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-sm" onClick={async () => { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); }}>
      {done ? '已複製' : '複製登入連結'}
    </button>
  );
}

/** A member's role select that saves as soon as it changes. */
export function RoleSelect({ userId, email, value, action }: { userId: string; email: string; value: string; action: (f: FormData) => void }) {
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <select name="role" className="select" defaultValue={value} aria-label={`${email} 的角色`} onChange={(e) => e.currentTarget.form?.requestSubmit()} style={{ minHeight: 34, fontSize: 13 }}>
        {(['editor', 'admin'] as const).map((r) => <option key={r} value={r}>{ROLE_TEXT[r]!.name}</option>)}
      </select>
    </form>
  );
}

/** A delete-style button that asks first; used for removing members and withdrawing invites. */
export function ConfirmButton({ action, field, value, label, question }: { action: (f: FormData) => void; field: string; value: string; label: string; question: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(question)) e.preventDefault(); }}>
      <input type="hidden" name={field} value={value} />
      <button type="submit" className="btn icon-btn" aria-label={label} title={label} style={{ width: 36, height: 36, minHeight: 36, color: 'var(--err)' }}><Icon name="trash" size={16} /></button>
    </form>
  );
}
