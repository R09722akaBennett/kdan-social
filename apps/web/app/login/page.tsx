import { signInWithFacebook } from './actions';

const ERRORS: Record<string, string> = {
  cancelled: '你在 Facebook 取消了登入。',
  no_email: '這個 Facebook 帳號沒有提供 Email，所以無法登入。請到 Facebook 設定加入 Email，或在授權畫面允許分享 Email 後再試一次。',
  start: '目前無法連到 Facebook，請稍後再試。',
  failed: '登入沒有完成，請再試一次。',
};

const FB_LOGO = 'M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07';

/** Facebook as the only way in, after Circle's and Time2book's sign-in cards. */
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 400, margin: '96px auto', padding: '0 16px' }}>
      <div className="brand" style={{ padding: 0, marginBottom: 24 }}><span className="brand-mark">K</span>kdan-social</div>
      <div className="card card-pad stack" style={{ gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>登入</h1>
          <div className="small muted" style={{ marginTop: 4 }}>用你的 Facebook 帳號登入。</div>
        </div>
        {error && <div className="alert" role="alert"><div className="body small">{ERRORS[error] ?? ERRORS.failed}</div></div>}
        <form action={signInWithFacebook}>
          <button type="submit" className="btn" style={{ width: '100%', minHeight: 44, gap: 10, background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d={FB_LOGO} fill="#fff" /></svg>
            用 Facebook 繼續
          </button>
        </form>
        <p className="tiny muted" style={{ margin: 0 }}>只會讀取你的名字與 Email，用來辨認你，以及讓同事用 Email 邀請你加入工作區。連結粉專是登入後另外授權的步驟。</p>
      </div>
    </main>
  );
}
