import { useState } from 'react';
import { Link } from '../router.jsx';
import { useStore } from '../store.jsx';
import { Icon } from '../components/ui.jsx';

const PLAN = [
  ['11/3 週二 20:00', '台灣', 'FB、IG', '雙十一倒數：今年 5 折適用哪些方案'],
  ['11/3 週二 21:00', '日本', 'IG', '年末セール予告：11/11 からスタート'],
  ['11/4 週三 12:00', '日本', 'LINE', '年末セール：対象プランまとめ（圖文卡片）'],
  ['11/5 週四 20:00', '台灣', 'FB、IG、LINE', '用戶故事：會計師的 PDF 表單流程'],
  ['11/5 週四 21:00', '日本', 'IG Reels', '電子署名を 3 ステップで（改寫自 @kdanmobile 的 Reels）'],
  ['11/7 週六 20:00', '台灣', 'IG', '雙十一前的整理術：把紙本變成可搜尋 PDF'],
];

const CANNED = {
  '把這週的成效整理成給主管的 5 句話': [
    '本週所有帳號共發 16 篇、38 個發文任務，粉絲淨增 1,245 人（+0.8%）。',
    '美國 IG 表現最好，觸及比上週高 38%，主要來自電子簽名教學 Reels。',
    '日本 LINE 開封率 61%，是轉換最好的管道；日本 FB 互動偏低（1.2%）。',
    '台灣 IG 授權在 10/18 失效，期間沒有新貼文，需要盡快重新連結。',
    '下週建議把 Reels 複製到日本與台灣，並調整台灣 LINE 的發送對象以控制額度。',
  ],
  '找出各群組互動最好的貼文類型': [
    '台灣：教學型圖文（平均互動率 6.1%），用戶故事次之。',
    '美國：Reels（平均互動率 11.5%），單張圖片只有一半。',
    '日本：LINE 圖文卡片（點擊率 14%）；FB 各類型都偏低。',
  ],
  '下週有哪些貼文還沒送審？': [
    '10/27 台灣「Document 365 團隊方案 Q&A 直播預告」已排程，不用送審。',
    '10/24 台灣「用戶故事｜會計師如何用 PDF 表單」還是草稿，尚未送審。',
  ],
};

function AiAvatar() {
  return <span className="ai-avatar" aria-hidden="true"><Icon name="spark" size={16} /></span>;
}

export default function Assistant() {
  const { state, addAiDrafts } = useStore();
  const [extra, setExtra] = useState([]);
  const [msg, setMsg] = useState('');
  const [thinking, setThinking] = useState(false);

  const send = (text) => {
    const q = text.trim();
    if (!q) return;
    setMsg('');
    setThinking(true);
    setExtra((x) => [...x, { q, a: null }]);
    setTimeout(() => {
      setThinking(false);
      setExtra((x) => x.map((it, i) => (i === x.length - 1 ? { q, a: CANNED[q] || ['這是原型，只有下方建議問題有預先準備的回答。正式版會讀這個工作區的成效資料來回答。'] } : it)));
    }, 900);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, minHeight: '100vh' }}>
      <nav aria-label="對話紀錄" style={{ flex: '1 1 220px', maxWidth: 260, padding: '20px 12px', borderRight: '1px solid var(--line)', background: '#FAFBFC', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button type="button" className="btn" style={{ marginBottom: 10 }} onClick={() => setExtra([])}>新對話</button>
        <div className="tiny muted" style={{ padding: '4px 8px' }}>今天</div>
        <span className="small" style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--line-soft)', fontWeight: 500 }}>11 月台灣、日本貼文規劃</span>
        <div className="tiny muted" style={{ padding: '10px 8px 4px' }}>本週</div>
        <span className="small" style={{ padding: '8px 10px', color: 'var(--ink-2)' }}>美國 IG Reels 為什麼表現好</span>
        <span className="small" style={{ padding: '8px 10px', color: 'var(--ink-2)' }}>10 月成效報告給主管</span>
      </nav>

      <main className="main" style={{ flex: '999 1 480px' }}>
        <header className="row" style={{ gap: 10 }}>
          <h1 style={{ fontSize: 20 }}>11 月台灣、日本貼文規劃</h1>
          <span className="tiny muted">AI 只讀這個工作區的資料；產生的貼文一律存成草稿，不會自行發布</span>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 880, width: '100%' }}>
          <div style={{ alignSelf: 'flex-end', maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div className="bubble-me" style={{ maxWidth: '100%' }}>幫我規劃 11 月台灣和日本的貼文，每週 3 篇，主打雙十一和年末方案。</div>
            <div className="row tiny" style={{ gap: 4, color: 'var(--ink-2)' }}><span className="chip chip-neutral">群組：台灣、日本</span><span className="chip chip-neutral">品牌語氣：品牌＋群組規則</span></div>
          </div>

          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
            <AiAvatar />
            <div className="stack" style={{ flex: 1, minWidth: 0 }}>
              <div>排好了，兩個群組各 12 篇。依過去 30 天的資料：台灣 FB 週二、四 20:00 互動最好；日本 IG 在 21:00、LINE 在 12:00 開封率最高。日本對雙十一比較陌生，所以日本版主打「年末セール」，雙十一只當起點。</div>
              <div className="card table-wrap">
                <table style={{ minWidth: 620 }}>
                  <thead><tr><th>帳號時區的時間</th><th>群組</th><th>平台</th><th>主題</th></tr></thead>
                  <tbody>{PLAN.map(([w, m, p, t]) => <tr key={w + m}><td className="num" style={{ whiteSpace: 'nowrap' }}>{w}</td><td><span className="mk">{m}</span></td><td style={{ whiteSpace: 'nowrap' }}>{p}</td><td>{t}</td></tr>)}</tbody>
                </table>
                <div className="small muted" style={{ padding: '10px 18px', borderTop: '1px solid var(--line-soft)' }}>還有 18 篇（原型只列前 6 篇）</div>
              </div>
              <div className="row">
                {!state.aiDrafts ? (
                  <>
                    <button type="button" className="btn btn-primary" onClick={addAiDrafts}>24 篇都加到行事曆（草稿）</button>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--ok)', fontWeight: 500 }}>已加入草稿，每篇都要再送審才會排程。</span>
                    <Link to="/calendar" style={{ fontWeight: 500 }}>到行事曆查看（11/2 那週）</Link>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="bubble-me">上個月日本 IG 為什麼成長比較慢？</div>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
            <AiAvatar />
            <div className="stack" style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <div>日本 IG 近 30 天 +98 人（+1.6%），美國同期 +980 人（+4.8%）。主要有三個原因：</div>
              <ol className="stack" style={{ gap: 4 }}>
                <li>發文少：日本 IG 30 天只發 4 篇，美國 11 篇。</li>
                <li>沒有 Reels：美國新增追蹤有 62% 來自 3 支 Reels；日本 4 篇都是單張圖片。</li>
                <li>發文時段偏早：日本 4 篇都在 12:00 發，而日本帳號的追蹤者在 21:00 最活躍。</li>
              </ol>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--accent-wash)' }}><strong style={{ fontWeight: 600 }}>建議：</strong>把美國的電子簽名教學 Reels 改成日文版，週四 21:00 發。已放進上面的規劃（11/5）。</div>
              <div className="tiny muted">資料來源：9/20–10/19 每日粉絲快照、IG 貼文 insights。數字可在<Link to="/analytics">成效</Link>頁核對。</div>
            </div>
          </div>

          {extra.map((it, i) => (
            <div key={i} className="stack" style={{ gap: 20 }}>
              <div className="bubble-me">{it.q}</div>
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
                <AiAvatar />
                <div style={{ flex: 1, minWidth: 0 }} aria-live="polite">
                  {it.a ? <ul className="stack" style={{ gap: 4 }}>{it.a.map((t) => <li key={t}>{t}</li>)}</ul> : <span className="muted">分析中…</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', maxWidth: 880, width: '100%', display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0 16px', boxShadow: '0 -12px 12px -12px rgba(20,24,30,.12)' }}>
          <div className="row" style={{ gap: 6 }}>
            {Object.keys(CANNED).map((q) => <button key={q} type="button" className="pill" disabled={thinking} onClick={() => send(q)}>{q}</button>)}
          </div>
          <form className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'var(--control)' }} onSubmit={(e) => { e.preventDefault(); send(msg); }}>
            <label htmlFor="msg" className="sr-only">輸入訊息</label>
            <textarea id="msg" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="問成效、請它排內容、或改寫一篇貼文" style={{ border: 0, outline: 'none', resize: 'none' }} />
            <div className="row tiny" style={{ gap: 6 }}>
              <span className="chip chip-neutral">群組：台灣、日本</span>
              <span className="chip chip-neutral">資料：近 30 天</span>
              <button type="submit" className="btn btn-primary icon-btn spacer" aria-label="送出" disabled={thinking} style={{ width: 36, height: 36, minHeight: 36 }}><Icon name="send" size={16} stroke={2} /></button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
