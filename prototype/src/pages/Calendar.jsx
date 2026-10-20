import { useState } from 'react';
import { Link } from '../router.jsx';
import { useStore } from '../store.jsx';
import { MARKETS } from '../data.js';
import { Icon, Pf, Mk, Seg, MARKET_FILTER } from '../components/ui.jsx';

const ST = {
  done: { bar: 'var(--ok)', label: '已發布', fg: 'var(--ok)', border: 'var(--line)', style: 'solid' },
  plan: { bar: 'var(--accent)', label: '已排程', fg: 'var(--accent)', border: 'var(--line)', style: 'solid' },
  wait: { bar: 'var(--warn-bar)', label: '待審核', fg: 'var(--warn)', border: '#EBD9A8', style: 'solid' },
  chg: { bar: 'var(--err)', label: '要求修改', fg: 'var(--err)', border: 'var(--err-line)', style: 'solid' },
  fail: { bar: 'var(--err)', label: '部分失敗', fg: 'var(--err)', border: 'var(--err-line)', style: 'solid' },
  risk: { bar: 'var(--err)', label: '會失敗', fg: 'var(--err)', border: 'var(--err-line)', style: 'solid' },
  draft: { bar: 'transparent', label: '草稿', fg: 'var(--ink-3)', border: '#B8BEC7', style: 'dashed' },
};
const WD = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const START = new Date(2026, 9, 19);
const TODAY = '10/20';

// Posts keyed by Taipei date. `local` is the market's own clock when it differs.
function buildPosts({ igTwExpired, decisions, aiDrafts }) {
  const dec = (item, m) => ({ ok: 'plan', wait: 'wait', chg: 'chg' })[decisions[item][m]];
  const posts = [
    { date: '10/19', time: '19:00', m: 'tw', st: 'fail', text: '萬聖節限定貼圖上線', pfs: [['fb'], ['ig'], ['line', true]], detail: 'LINE 失敗：本月額度不足' },
    { date: '10/19', time: '20:00', m: 'jp', st: 'done', text: 'ハロウィン限定スタンプ配信開始', pfs: [['fb'], ['ig'], ['line']], local: '當地 21:00 JST' },
    { date: '10/20', time: '20:00', m: 'tw', st: igTwExpired ? 'risk' : 'plan', text: '雙十一優惠預告：全方案 5 折', pfs: [['fb'], ['ig', igTwExpired], ['line']], detail: igTwExpired ? 'IG 授權失效' : undefined },
    { date: '10/20', time: '19:00', m: 'jp', st: dec('p1', 'jp'), text: '11.11 セール予告', pfs: [['fb'], ['ig'], ['line']], local: '當地 20:00 JST', item: true },
    { date: '10/21', time: '08:00', m: 'us', st: dec('p1', 'us'), text: '11.11 Global Sale: 50% off', pfs: [['fb'], ['ig']], local: '當地 10/20 20:00 EDT', item: true },
    { date: '10/22', time: '12:00', m: 'tw', st: igTwExpired ? 'risk' : 'plan', text: '小技巧：一鍵把照片轉成可搜尋的 PDF', pfs: [['fb'], ['ig', igTwExpired]] },
    { date: '10/22', time: '20:00', m: 'jp', st: dec('p2', 'jp'), text: '新機能：AI 要約が長文に対応', pfs: [['fb'], ['ig']], local: '當地 21:00 JST', item: true },
    { date: '10/23', time: '21:00', m: 'us', st: 'plan', text: 'How to sign a PDF in 3 steps', pfs: [['fb'], ['ig']], local: '當地 09:00 EDT' },
    { date: '10/24', time: '20:00', m: 'tw', st: 'draft', text: '用戶故事｜會計師如何用 PDF 表單省下每週 3 小時', pfs: [['fb']] },
    { date: '10/27', time: '20:00', m: 'tw', st: 'plan', text: 'Document 365 團隊方案 Q&A 直播預告', pfs: [['fb'], ['line']] },
    { date: '10/29', time: '20:00', m: 'jp', st: 'plan', text: 'PDF Reader 新しいテンプレート機能', pfs: [['fb'], ['ig']], local: '當地 21:00 JST' },
    { date: '10/31', time: '08:00', m: 'us', st: 'plan', text: 'Halloween: spooky-fast PDF tips', pfs: [['ig']], local: '當地 10/30 20:00 EDT' },
  ];
  if (aiDrafts) {
    posts.push(
      { date: '11/3', time: '20:00', m: 'tw', st: 'draft', ai: true, text: '雙十一倒數：今年 5 折適用哪些方案', pfs: [['fb'], ['ig']] },
      { date: '11/3', time: '20:00', m: 'jp', st: 'draft', ai: true, text: '年末セール予告：11/11 からスタート', pfs: [['ig']], local: '當地 21:00 JST' },
      { date: '11/4', time: '11:00', m: 'jp', st: 'draft', ai: true, text: '年末セール：対象プランまとめ', pfs: [['line']], local: '當地 12:00 JST' },
      { date: '11/5', time: '20:00', m: 'tw', st: 'draft', ai: true, text: '用戶故事：會計師的 PDF 表單流程', pfs: [['fb'], ['ig'], ['line']] },
      { date: '11/5', time: '20:00', m: 'jp', st: 'draft', ai: true, text: '電子署名を 3 ステップで（Reels）', pfs: [['ig']], local: '當地 21:00 JST' },
      { date: '11/7', time: '20:00', m: 'tw', st: 'draft', ai: true, text: '雙十一前的整理術：把紙本變成可搜尋 PDF', pfs: [['ig']] },
    );
  }
  return posts;
}

function PostCard({ p }) {
  const s = ST[p.st];
  const to = p.item && (p.st === 'wait' || p.st === 'chg') ? '/approvals' : '/compose';
  return (
    <Link to={to} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 8, border: `1px ${s.style} ${s.border}`, background: '#fff', boxShadow: `inset 3px 0 0 ${s.bar}`, color: 'var(--ink)' }}>
      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <span className="tiny num" style={{ fontWeight: 600 }}>{p.time}</span>
        <Mk market={p.m} />
        <span className="spacer" style={{ fontSize: 11, color: s.fg }}>{s.label}</span>
      </span>
      {p.local && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.local}</span>}
      <span lang={MARKETS[p.m].lang} className="small" style={{ lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.text}</span>
      <span className="row" style={{ gap: 4 }}>
        {p.pfs.map(([pf, bad]) => <Pf key={pf} pf={pf} size="sm" bad={bad} />)}
        {p.ai && <span className="spacer" style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>AI 草稿</span>}
      </span>
    </Link>
  );
}

export default function Calendar() {
  const store = useStore();
  const [view, setView] = useState('week');
  const [mk, setMk] = useState('all');
  const [week, setWeek] = useState(0);

  const posts = buildPosts({ igTwExpired: store.igTwExpired, decisions: store.state.decisions, aiDrafts: store.state.aiDrafts })
    .filter((p) => mk === 'all' || p.m === mk);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(START);
    d.setDate(START.getDate() + week * 7 + i);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    return { key, wd: WD[i], num: d.getDate(), today: key === TODAY, past: week === 0 && i === 0, posts: posts.filter((p) => p.date === key).sort((a, b) => a.time.localeCompare(b.time)) };
  });
  const first = days[0].key;
  const last = days[6].key;
  const weekPosts = days.flatMap((d) => d.posts.map((p) => ({ ...p, wd: d.wd })));

  return (
    <main className="main">
      <header className="page-head" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 12 }}>
          <h1>行事曆</h1>
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn icon-btn" aria-label="上一週" disabled={week === 0} onClick={() => setWeek((w) => w - 1)} style={{ width: 36, height: 36, minHeight: 36 }}><Icon name="chevronLeft" size={16} stroke={2} /></button>
            <button type="button" className="btn btn-sm" onClick={() => setWeek(0)}>本週</button>
            <button type="button" className="btn icon-btn" aria-label="下一週" disabled={week === 2} onClick={() => setWeek((w) => w + 1)} style={{ width: 36, height: 36, minHeight: 36 }}><Icon name="chevronRight" size={16} stroke={2} /></button>
          </div>
          <span style={{ fontWeight: 500 }}>2026 年 {first} – {last}</span>
        </div>
        <div className="row">
          <Seg label="市場" value={mk} onChange={setMk} options={MARKET_FILTER} />
          <Seg label="檢視" value={view} onChange={setView} options={[['week', '週'], ['list', '清單']]} />
          <span className="chip" style={{ height: 36, border: '1px solid var(--control)', background: '#fff', fontSize: 13 }}>顯示時區：台北</span>
        </div>
      </header>

      <div className="row tiny" style={{ gap: 16, color: 'var(--ink-2)' }}>
        {[['已排程', 'var(--accent)'], ['待審核', 'var(--warn-bar)'], ['已發布', 'var(--ok)'], ['失敗、會失敗或要求修改', 'var(--err)']].map(([l, c]) => (
          <span key={l} className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>
        ))}
        <span className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, border: '1px dashed #8A9099' }} />草稿（含 AI 草稿）</span>
      </div>

      {week === 2 && !store.state.aiDrafts && (
        <div className="card card-pad row" style={{ justifyContent: 'space-between' }}>
          <span>這週還沒有貼文。</span>
          <Link to="/assistant" className="btn btn-soft btn-sm">請 AI 助理排一個月的草稿</Link>
        </div>
      )}

      {view === 'week' ? (
        <div className="card table-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', minWidth: 1000 }}>
            {days.map((d) => (
              <div key={d.key} style={{ borderRight: '1px solid var(--line-soft)', minHeight: 620, background: d.today ? '#F7F9FF' : d.past ? '#FAFBFC' : '#fff' }}>
                <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-soft)', alignItems: 'baseline' }}>
                  <span className="tiny muted">{d.wd}</span>
                  <span className="num" style={{ fontSize: 18, fontWeight: 600, color: d.today ? 'var(--accent)' : 'var(--ink)' }}>{d.num}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 8px' }}>
                  {d.posts.map((p) => <PostCard key={p.m + p.time + p.text} p={p} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          {weekPosts.length === 0 && <div className="list-row muted">這週沒有貼文。</div>}
          {weekPosts.map((p) => (
            <div key={p.m + p.date + p.time + p.text} className="list-row">
              <span className="num" style={{ width: 120, color: 'var(--ink-2)' }}>{p.wd} {p.date} {p.time}</span>
              <Mk market={p.m} />
              <span lang={MARKETS[p.m].lang} style={{ flex: '1 1 260px', minWidth: 0 }}>{p.text}</span>
              <span className="row" style={{ gap: 4 }}>{p.pfs.map(([pf, bad]) => <Pf key={pf} pf={pf} size="sm" bad={bad} />)}</span>
              <span className="small" style={{ width: 200, textAlign: 'right', color: ST[p.st].fg }}>{p.detail || ST[p.st].label}{p.ai ? '（AI）' : ''}</span>
            </div>
          ))}
        </div>
      )}

      <p className="small muted">時間都換算成台北時間顯示，卡片第二行是當地時間。Facebook 排程交給 Meta 保管；Instagram 與 LINE 由我們的排程器送出。帳號授權失效時，相關貼文會提前標紅。</p>
    </main>
  );
}
