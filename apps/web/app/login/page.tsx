import { signInWithFacebook } from './actions';

const ERRORS: Record<string, string> = {
  cancelled: '你在 Facebook 取消了登入。',
  no_email: '這個 Facebook 帳號沒有提供 Email，所以無法登入。請到 Facebook 設定加入 Email，或在授權畫面允許分享 Email 後再試一次。',
  start: '目前無法連到 Facebook，請稍後再試。',
  failed: '登入沒有完成，請再試一次。',
};

const FB_LOGO = 'M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07';

// The illustration's week: which day holds which post, by platform colour.
const WEEK: Array<[string, Array<['fb' | 'ig' | 'line', string, string]>]> = [
  ['週一', [['fb', '20:00', '雙十一倒數']]],
  ['週二', [['ig', '21:00', '年末セール'], ['line', '12:00', '方案整理']]],
  ['週三', []],
  ['週四', [['fb', '20:00', '用戶故事'], ['ig', '21:00', '3 步驟簽名']]],
  ['週五', [['line', '12:00', '週末優惠']]],
];

/** A picture of the product built from its own pieces: a week of posts, with numbers and an AI tip floating over it. */
function Showcase() {
  return (
    <aside className="login-showcase" aria-hidden="true">
      <span className="login-badge">kdan-social</span>
      <h2 className="login-headline">一次排好 Facebook、<br />Instagram、LINE</h2>
      <p className="login-sub">各帳號照自己的時區發文，成效一頁看完</p>
      <div className="login-stage">
        <div className="login-week">
          {WEEK.map(([day, posts]) => (
            <div key={day} className="login-day">
              <span className="login-dayname">{day}</span>
              {posts.map(([pf, time, title]) => (
                <span key={time + title} className={`login-post pf-${pf}`}>
                  <span className="login-post-time">{time}</span>
                  <span>{title}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="login-float f1">
          <span className="login-float-label">觸及（近 7 天）</span>
          <span className="login-float-value">33,500 <span className="login-up">↗ 12%</span></span>
        </div>
        <div className="login-float f2">
          <span className="login-float-label">粉絲</span>
          <span className="login-float-value">+541 <span className="login-up">↗</span></span>
        </div>
        <div className="login-float f3">
          <span className="login-ai">✦</span>
          <span>
            <span className="login-float-label" style={{ display: 'block', color: 'var(--accent)', fontWeight: 600, letterSpacing: '.04em' }}>AI 助理建議</span>
            <span style={{ fontWeight: 600 }}>日本 IG 週四 21:00 互動最好</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

/**
 * Facebook as the only way in, laid out as Buffer's sign-in page: the form on the left,
 * the product on the right, as Clay and Origin float cards over their own UI.
 */
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login">
      <main className="login-main">
        <div className="login-form">
          <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 10, fontSize: 18 }}>K</span>
          <h1 style={{ fontSize: 26, marginTop: 18 }}>登入 kdan-social</h1>
          <p className="small" style={{ color: 'var(--ink-2)', margin: '8px 0 0' }}>用你的 Facebook 帳號登入；第一次使用也是按這裡。</p>
          {error && <div className="alert" role="alert" style={{ marginTop: 20, textAlign: 'left', width: '100%' }}><div className="body small">{ERRORS[error] ?? ERRORS.failed}</div></div>}
          <form action={signInWithFacebook} style={{ width: '100%', marginTop: 28 }}>
            <button type="submit" className="btn" style={{ width: '100%', minHeight: 48, gap: 10, background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600, fontSize: 15 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d={FB_LOGO} fill="#fff" /></svg>
              用 Facebook 繼續
            </button>
          </form>
          <p className="tiny muted" style={{ margin: '16px 0 0' }}>只會讀取你的名字與 Email，用來辨認你，以及讓同事用 Email 邀請你加入工作區。連結粉專是登入後另外授權的步驟。</p>
        </div>
      </main>
      <Showcase />
    </div>
  );
}
