import { sendLoginLink } from './actions';

const ERRORS: Record<string, string> = {
  email: '請輸入正確的 Email。',
  rate: '寄送太頻繁，請過幾分鐘再試。',
  send: '登入連結寄送失敗，請稍後再試。',
  link: '登入連結無效或已過期，請重新寄送。',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  return (
    <main style={{ maxWidth: 400, margin: '96px auto', padding: '0 16px' }}>
      <div className="brand" style={{ padding: 0, marginBottom: 24 }}><span className="brand-mark">K</span>kdan-social</div>
      <div className="card card-pad stack">
        <h1 style={{ fontSize: 20 }}>登入</h1>
        {sent ? (
          <p>登入連結已寄到 <strong>{sent}</strong>，請到信箱點連結完成登入。連結 1 小時內有效。</p>
        ) : (
          <form action={sendLoginLink} className="stack">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input" />
            </div>
            {error && <p className="small" style={{ color: 'var(--err)', margin: 0 }}>{ERRORS[error] ?? ERRORS.send}</p>}
            <button type="submit" className="btn btn-primary">寄送登入連結</button>
          </form>
        )}
      </div>
    </main>
  );
}
