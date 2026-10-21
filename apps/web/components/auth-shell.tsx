import type { ReactNode } from 'react';

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

/** The sign-in, sign-up and password pages: the form on the left, the product on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="login">
      <main className="login-main">
        <div className="login-form">
          <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 10, fontSize: 18 }}>K</span>
          {children}
        </div>
      </main>
      <Showcase />
    </div>
  );
}
