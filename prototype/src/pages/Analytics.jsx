import { useState } from 'react';
import { Link } from '../router.jsx';
import { useStore } from '../store.jsx';
import { PF, fmt, tzOf } from '../data.js';
import { Pf, Seg, Sparkline, FilterMenu, GroupTag, AiHeader } from '../components/ui.jsx';

const COLOR = { fb: '#1877F2', ig: '#C13584', line: '#0B7A3B' };
const START = { 7: '10/14', 30: '9/21', 90: '7/23' };
// Keyed by the account the insight is about, so the group filter can drop it.
const INSIGHTS = [
  ['tw_ig', '「@kdanmobile_tw」授權失效期間（10/18 起）沒有新貼文，近 7 天成長主要來自 10/15 的教學貼文。', '每日快照、IG 貼文 insights'],
  ['us_ig', '「@kdanmobile」新增追蹤有 62% 來自 3 支 Reels，單張圖片貼文的互動率只有 Reels 的一半。', '9/20–10/19 IG 貼文 insights'],
  ['jp_line', '「KDAN Japan」LINE 開封率 61%、點擊率 14%，是所有帳號轉換最好的；「KDAN Mobile 日本」FB 互動率 1.2% 偏低。', 'LINE insight、FB 貼文 insights'],
];
// Recommended slots per account, in the account's own time zone.
const BEST = {
  tw_fb: [['週二 20:00', '互動率最高（4.8%）'], ['週四 20:00', '互動率第二']],
  tw_ig: [['週六 21:00', '追蹤者上線最多'], ['週四 20:00', '互動率前三']],
  us_ig: [['週三 19:00', '追蹤者上線最多'], ['週日 20:00', 'Reels 觸及最好']],
  us_fb: [['週五 09:00', '點擊率最高']],
  jp_ig: [['週四 21:00', '追蹤者上線最多']],
  jp_line: [['平日 12:00', '開封率最高（午休）']],
  jp_fb: [['週日 20:00', '互動相對最好']],
};
const POSTS = [
  ['Document 365 教學：三步驟電子簽名', [['tw_fb', '8,412', '326', '3.9%'], ['tw_ig', '3,105', '288', '9.3%'], ['tw_line', '2,947 開封', '412 點擊', '14.0%'], ['us_ig', '18,240', '2,104', '11.5%'], ['jp_line', '11,529 開封', '1,614 點擊', '14.0%']]],
  ['萬聖節限定貼圖上線', [['tw_fb', '12,960', '845', '6.5%'], ['jp_fb', '3,880', '47', '1.2%'], ['jp_ig', '2,210', '198', '9.0%']]],
];
const SEEDS = { tw_fb: 7, tw_ig: 11, tw_line: 3, us_fb: 5, us_ig: 13, jp_fb: 17, jp_ig: 19, jp_line: 23 };

function noteFor(a, d) {
  if (a.id === 'tw_ig' && d === 90) return 'IG 只能回溯 30 天，更早的部分從連結日起每天自己存，會慢慢補齊。';
  if (a.id === 'jp_ig' && d !== 7) return '近 30 天只發 4 篇，成長集中在 10/12 那一篇。';
  if (a.pf === 'line') return 'LINE 統計隔天才更新。';
  return null;
}

export default function Analytics() {
  const { state, watch, toast, accounts: all, groups, groupName } = useStore();
  const [filter, setFilter] = useState([]);
  const [d, setD] = useState(30);
  const [handle, setHandle] = useState('');
  const accounts = all.filter((a) => filter.length === 0 || filter.includes(a.group ?? 'none'));
  const ids = new Set(accounts.map((a) => a.id));
  const byId = (id) => all.find((a) => a.id === id);
  const insights = INSIGHTS.filter(([id]) => ids.has(id)).map(([, t, src]) => [t, src]);

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>成效</h1>
          <div className="sub">2026/{START[d]} – 2026/10/20 · {accounts.length} 個帳號</div>
        </div>
        <div className="row">
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} value={filter} onChange={setFilter} />
          <Seg label="期間" value={d} onChange={setD} options={[[7, '7 天'], [30, '30 天'], [90, '90 天']]} />
          <button type="button" className="btn" onClick={() => toast('原型：PDF 報告尚未實作')}>匯出 PDF 報告</button>
        </div>
      </header>

      <section className="card card-ai card-pad stack" style={{ gap: 10 }}>
        <AiHeader title="AI 分析" note="只讀這頁的數字，每個結論都附出處">
          <Link to="/assistant" className="spacer small">在 AI 助理裡追問</Link>
        </AiHeader>
        <ul className="stack" style={{ gap: 6 }}>
          {insights.map(([t, src]) => <li key={t}>{t} <span className="tiny muted">（{src}）</span></li>)}
        </ul>
      </section>

      <section className="stack" aria-labelledby="h-fans">
        <h2 id="h-fans">粉絲數</h2>
        <div className="grid">
          {accounts.map((a) => {
            const grow = a.grow[d];
            const note = noteFor(a, d);
            return (
              <div key={a.id} className="card stack" style={{ padding: '14px 16px', gap: 6 }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <Pf pf={a.pf} size="sm" />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.name}</span>
                  <GroupTag name={a.group ? groupName(a.group) : null} />
                </div>
                <div className="row" style={{ alignItems: 'baseline' }}>
                  <span className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{fmt(a.followers)}</span>
                  <span className="small" style={{ fontWeight: 500, color: 'var(--ok)' }}>+{fmt(grow)}（{((grow / (a.followers - grow)) * 100).toFixed(1)}%）</span>
                </div>
                <Sparkline from={a.followers - grow} to={a.followers} days={d} seed={SEEDS[a.id]} color={COLOR[a.pf]} label={`${a.name} 近 ${d} 天由 ${fmt(a.followers - grow)} 增加到 ${fmt(a.followers)}`} />
                {note && <div className="tiny" style={{ color: 'var(--ink-2)', background: 'var(--bg)', borderRadius: 6, padding: '6px 8px' }}>{note}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="h-best">
        <div className="card-head">
          <h2 id="h-best">推薦發文時段</h2>
          <span className="tiny muted">IG 依追蹤者上線時間；FB、LINE 依近 30 天貼文的互動與開封。都是該帳號時區的時間</span>
        </div>
        <div className="grid" style={{ gap: 0 }}>
          {accounts.filter((a) => BEST[a.id]).map((a) => (
            <div key={a.id} className="stack" style={{ padding: '14px 18px', gap: 8 }}>
              <span className="row" style={{ fontWeight: 600, gap: 6 }}><Pf pf={a.pf} size="sm" />{a.name}<span className="tiny muted" style={{ fontWeight: 400 }}>{tzOf(a.tz).short}</span></span>
              {BEST[a.id].map(([w, why]) => (
                <div key={w} className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                  <span className="num" style={{ width: 92, fontWeight: 600 }}>{w}</span>
                  <span className="small" style={{ color: 'var(--ink-2)' }}>{why}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="h-posts">
        <div className="card-head">
          <h2 id="h-posts">貼文成效</h2>
          <span className="small muted">同一篇內容在各帳號分列；指標照平台原意，不硬加總</span>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 860 }}>
            <thead><tr><th>貼文</th><th style={{ width: 220 }}>帳號</th><th className="right" style={{ width: 120 }}>觸及／開封</th><th className="right" style={{ width: 120 }}>互動／點擊</th><th className="right" style={{ width: 90 }}>互動率</th></tr></thead>
            <tbody>
              {POSTS.flatMap(([title, rows]) => rows.filter(([id]) => ids.has(id)).map(([id, reach, eng, rate], i) => (
                <tr key={title + id} style={{ borderTop: i === 0 ? '1px solid var(--line)' : undefined }}>
                  <td>{i === 0 ? title : ''}</td>
                  <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Pf pf={byId(id).pf} size="sm" />{byId(id).name}</span></td>
                  <td className="right num">{reach}</td>
                  <td className="right num">{eng}</td>
                  <td className="right num" style={{ fontWeight: 600 }}>{rate}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad row" aria-labelledby="h-watch" style={{ gap: '12px 16px' }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <h2 id="h-watch">追蹤其他 Instagram 帳號</h2>
          <div className="small" style={{ color: 'var(--ink-2)' }}>輸入任何 IG 商業帳號名稱，每天記錄它的公開粉絲數與貼文數，和自己的帳號放在一起比。</div>
          {state.watched.length > 0 && <div className="row small" style={{ marginTop: 8, gap: 6 }}>追蹤中：{state.watched.map((h) => <span key={h} className="chip chip-plan">{h}</span>)}</div>}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const h = handle.trim(); if (h) { watch(h.startsWith('@') ? h : `@${h}`); setHandle(''); } }}>
          <label htmlFor="watch" className="sr-only">Instagram 帳號名稱</label>
          <input id="watch" className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@帳號名稱" style={{ width: 200 }} />
          <button type="submit" className="btn">開始追蹤</button>
        </form>
      </section>
    </main>
  );
}
