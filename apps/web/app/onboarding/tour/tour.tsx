'use client';

import { useEffect, useState } from 'react';
import { PlatformMark } from '@/components/brand-icons';
import { Icon } from '@/components/ui';

const ITEMS = [
  { title: '一次排到每個帳號', text: 'FB、IG、LINE 一起排程，各帳號照自己的時區發出。', tint: '#DCE6FB' },
  { title: '送審再發布', text: '編輯寫好送審，擁有者或管理員核准後才會發出。', tint: '#DDF1E3' },
  { title: 'AI 照品牌語氣寫', text: '改寫、縮短、各平台版本，都照你設定的語氣和禁用詞。', tint: '#EDE4FB' },
  { title: '成效一頁看完', text: '觸及、互動、粉絲成長，還有 AI 幫你整理重點。', tint: '#FCEFD4' },
];
const STEP_MS = 5000;

/** A small picture of each feature, built from the app's own pieces. */
function Panel({ n }: { n: number }) {
  if (n === 0) {
    return (
      <div className="tour-card">
        <div className="tour-card-title">10 月 27 日 週一</div>
        {([['facebook', '20:00', 'KDAN Mobile 台灣', '雙十一倒數 3 天'], ['instagram', '21:00', '@kdanmobile_jp', '年末セール予告'], ['line', '12:00', 'KDAN 官方帳號', '本週優惠整理']] as const).map(([pf, t, acc, title]) => (
          <div key={acc} className="tour-row"><PlatformMark pf={pf} size={20} /><span className="tour-time">{t}</span><span><b>{title}</b><span className="tour-sub">{acc}</span></span></div>
        ))}
      </div>
    );
  }
  if (n === 1) {
    return (
      <div className="tour-card">
        <div className="tour-card-title">待審核 · 新功能：AI 摘要</div>
        <div className="tour-quote">新功能：AI 摘要支援 30 頁以上的長文件，合約和報告也能快速看重點。</div>
        <div className="tour-row" style={{ justifyContent: 'flex-end', gap: 8 }}><span className="tour-btn">要求修改</span><span className="tour-btn primary"><Icon name="tick" size={12} stroke={3} />核准</span></div>
      </div>
    );
  }
  if (n === 2) {
    return (
      <div className="tour-card">
        <div className="tour-card-title"><span style={{ color: 'var(--accent)' }}>✦</span> AI 改寫 · 更口語</div>
        <div className="tour-quote" style={{ textDecoration: 'line-through', color: 'var(--ink-3)' }}>本公司推出 PDF Reader 年度方案優惠活動。</div>
        <div className="tour-quote">PDF Reader 年度方案限時 5 折，手刀把握這 72 小時！</div>
        <div className="tour-row" style={{ justifyContent: 'flex-end' }}><span className="tour-btn primary">套用</span></div>
      </div>
    );
  }
  return (
    <div className="tour-card">
      <div className="tour-card-title">近 30 天</div>
      <div className="tour-stats"><span><small>觸及</small><b>33,500</b></span><span><small>互動</small><b>2,184</b></span><span><small>淨增粉絲</small><b>+541</b></span></div>
      <div className="tour-bars" aria-hidden="true">{[40, 62, 35, 78, 54, 90, 70].map((h, k) => <span key={k} style={{ height: `${h}%` }} />)}</div>
    </div>
  );
}

/**
 * What the product does, after Buffer's "Here's what you can do": a list on the left
 * that steps through by itself, each item's picture on a coloured panel on the right.
 */
export function Tour() {
  const [n, setN] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => setN((x) => (x + 1) % ITEMS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [n, paused]);
  return (
    <main className="tour">
      <header className="ob-head" style={{ gridTemplateColumns: 'auto 1fr' }}><span className="brand"><span className="brand-mark">K</span>kdan-social</span></header>
      <div className="tour-body">
        <section className="tour-left">
          <p className="small" style={{ color: 'var(--ok)', fontWeight: 600, margin: 0 }}>準備好了</p>
          <h1 className="tour-title">kdan-social 可以幫你做這些事</h1>
          <ol className="tour-list" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            {ITEMS.map((it, k) => (
              <li key={it.title}>
                <button type="button" aria-current={k === n} onClick={() => setN(k)}>
                  <span className="tour-item-title">{it.title}</span>
                  {k === n && <span className="tour-item-text">{it.text}</span>}
                  {k === n && !paused && <span className="tour-progress" style={{ animationDuration: `${STEP_MS}ms` }} />}
                </button>
              </li>
            ))}
          </ol>
          <a href="/app" className="btn btn-primary ob-continue" style={{ alignSelf: 'flex-start' }}>開始使用 <span aria-hidden="true">→</span></a>
        </section>
        <section className="tour-right" aria-hidden="true" style={{ background: ITEMS[n]!.tint }}>
          <div key={n} className="tour-panel"><Panel n={n} /></div>
        </section>
      </div>
    </main>
  );
}
