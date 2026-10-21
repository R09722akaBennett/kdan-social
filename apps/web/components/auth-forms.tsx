'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { sendResetAction, signInAction, signUpAction, updatePasswordAction, type AuthState } from '@/app/login/actions';
import { PASSWORD_RULES, passwordOk } from '@/lib/password';

function Submit({ children, disabled }: { children: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary auth-submit" disabled={disabled || pending}>{pending ? '請稍候…' : children}</button>;
}

function FormError({ state }: { state: AuthState }) {
  return state.error ? <div className="alert" role="alert" style={{ width: '100%' }}><div className="body small">{state.error}</div></div> : null;
}

/** A password box with a 顯示／隱藏 switch next to its label, as Buffer's. */
function PasswordField({ label, value, onChange, autoComplete, aside }: { label: string; value?: string; onChange?: (v: string) => void; autoComplete: string; aside?: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field" style={{ width: '100%' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label htmlFor="password">{label}</label>
        <span className="row tiny" style={{ gap: 12 }}>
          {aside}
          <button type="button" className="link-btn" onClick={() => setShown((s) => !s)} aria-pressed={shown}>{shown ? '隱藏' : '顯示'}</button>
        </span>
      </div>
      <input id="password" name="password" type={shown ? 'text' : 'password'} className="input" required autoComplete={autoComplete}
        value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} />
    </div>
  );
}

/** Each rule ticks as it is met, so nobody learns the rules from an error. */
function Rules({ password }: { password: string }) {
  return (
    <ul className="pw-rules" aria-label="密碼規則">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return <li key={r.key} data-ok={ok}><span aria-hidden="true">{ok ? '✓' : '•'}</span>{r.text}<span className="sr-only">{ok ? '（符合）' : '（尚未符合）'}</span></li>;
      })}
    </ul>
  );
}

export function LoginForm({ invite }: { invite?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signInAction, {});
  return (
    <form action={action} className="auth-fields">
      {invite && <input type="hidden" name="invite" value={invite} />}
      <FormError state={state} />
      <div className="field" style={{ width: '100%' }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" defaultValue={state.email} autoFocus />
      </div>
      <PasswordField label="密碼" autoComplete="current-password" aside={<a href="/forgot-password">忘記密碼？</a>} />
      <Submit>登入</Submit>
    </form>
  );
}

export function SignupForm({ invite }: { invite?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signUpAction, {});
  const [password, setPassword] = useState('');
  return (
    <form action={action} className="auth-fields">
      {invite && <input type="hidden" name="invite" value={invite} />}
      <FormError state={state} />
      <div className="field" style={{ width: '100%' }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" defaultValue={state.email} autoFocus />
      </div>
      <PasswordField label="設定密碼" value={password} onChange={setPassword} autoComplete="new-password" />
      <Rules password={password} />
      <Submit disabled={!passwordOk(password)}>建立帳號</Submit>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState<AuthState, FormData>(sendResetAction, {});
  if (state.sent) {
    return <p className="small" style={{ margin: '24px 0 0', color: 'var(--ink-2)' }}>如果 <strong>{state.sent}</strong> 有註冊，重設密碼的信已經寄出。請在同一個瀏覽器打開信裡的連結，1 小時內有效。</p>;
  }
  return (
    <form action={action} className="auth-fields">
      <FormError state={state} />
      <div className="field" style={{ width: '100%' }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" defaultValue={state.email} autoFocus />
      </div>
      <Submit>寄送重設連結</Submit>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState<AuthState, FormData>(updatePasswordAction, {});
  const [password, setPassword] = useState('');
  return (
    <form action={action} className="auth-fields">
      <FormError state={state} />
      <PasswordField label="新密碼" value={password} onChange={setPassword} autoComplete="new-password" />
      <Rules password={password} />
      <Submit disabled={!passwordOk(password)}>更新密碼</Submit>
    </form>
  );
}
