import { useState } from 'react';
import { Link } from '../router.jsx';
import { useStore } from '../store.jsx';
import { APPROVAL_ITEMS, fmt, tzOf } from '../data.js';
import { Icon, Pf, Chip, FilterMenu, AiHeader } from '../components/ui.jsx';

// Insights mention accounts, so they follow the group filter by account id.
const INSIGHTS = [
  { ids: ['tw_ig'], text: '「@kdanmobile_tw」授權失效 2 天，期間沒有新貼文；「KDAN Mobile 台灣」互動率 4.1%，和上週持平。', expiredOnly: true },
  { ids: ['us_ig'], text: '「@kdanmobile」觸及比上週高 38%，主要來自 10/17 的電子簽名教學 Reels。' },
  { ids: ['jp_line', 'jp_fb'], text: '「KDAN Japan」LINE 開封率 61%，是所有帳號最高；同一則內容在「KDAN Mobile 日本」的互動率只有 1.2%。' },
];

export default function Overview() {
  const [filter, setFilter] = useState([]);
  const { igTwExpired, reconnect, state, pendingItems, accounts: all, groups } = useStore();
  const inFilter = (a) => filter.length === 0 || filter.includes(a.group ?? 'none');
  const accounts = all.filter(inFilter);
  const ids = new Set(accounts.map((a) => a.id));
  const total = accounts.reduce((s, a) => s + a.followers, 0);
  const grow = accounts.reduce((s, a) => s + a.grow[7], 0);

  const pendingPosts = pendingItems.filter((k) => Object.keys(APPROVAL_ITEMS[k].accounts).some((id) => ids.has(id)));
  const share = accounts.length / all.length;
  const published = [Math.round(16 * share), Math.round(38 * share)];
  const failed = ids.has('tw_line') ? 1 : 0;

  const decisionChip = (item) => {
    const d = state.decisions[item];
    if (d === 'ok') return ['ok', '已核准'];
    if (d === 'chg') return ['err', '要求修改'];
    return ['warn', '待審核'];
  };
  const upcoming = [
    { time: '20:00', day: '今天', text: '雙十一優惠預告：PDF Reader 全方案 5 折', status: decisionChip('p1'), accounts: Object.keys(APPROVAL_ITEMS.p1.accounts) },
    { time: '20:00', day: '10/22 週四', text: '新功能：AI 摘要支援長文件', status: decisionChip('p2'), accounts: Object.keys(APPROVAL_ITEMS.p2.accounts) },
    { time: '12:00', day: '10/22 週四', text: '小技巧：一鍵把照片轉成可搜尋的 PDF', status: ['plan', '已排程'], accounts: ['tw_fb', 'tw_ig', 'us_fb', 'us_ig'] },
  ].map((p) => ({ ...p, accounts: p.accounts.filter((id) => ids.has(id)) })).filter((p) => p.accounts.length);

  const insights = INSIGHTS.filter((i) => i.ids.some((id) => ids.has(id)) && (!i.expiredOnly || igTwExpired));
  const shownGroups = [...groups, { id: null, name: '未分組' }].filter((g) => (filter.length === 0 || filter.includes(g.id ?? 'none')) && all.some((a) => (a.group ?? null) === g.id));

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>總覽</h1>
          <div className="sub">KDAN Mobile · 10 月 20 日 星期二 · 以台北時間顯示</div>
        </div>
        <div className="row">
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} value={filter} onChange={setFilter} />
          <Link to="/compose" className="btn btn-primary">新增貼文</Link>
        </div>
      </header>

      {igTwExpired && ids.has('tw_ig') && (
        <section className="alert" aria-label="需要處理">
          <span style={{ color: 'var(--err)', display: 'flex' }}><Icon name="alert" size={20} stroke={2} /></span>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <div className="title">Instagram「@kdanmobile_tw」的授權已在 10/18 失效</div>
            <div className="body">之後有 2 篇排程貼文會發不出去。重新連結後，這些貼文會照原時間發布。</div>
          </div>
          <button type="button" className="btn btn-danger" onClick={() => reconnect('tw_ig')}>重新連結</button>
        </section>
      )}

      <section className="grid" style={{ '--min': '200px' }} aria-label="數字">
        <Link to="/analytics" className="card stat">
          <span className="small muted">總粉絲數（{accounts.length} 個帳號）</span>
          <span className="value">{fmt(total)}</span>
          <span className="small" style={{ color: 'var(--ok)' }}>+{fmt(grow)} 近 7 天</span>
        </Link>
        <Link to="/calendar" className="card stat">
          <span className="small muted">本週已發布</span>
          <span className="value">{published[0]} 篇</span>
          <span className="small muted">共 {published[1]} 個發文任務</span>
        </Link>
        <Link to="/approvals" className="card stat">
          <span className="small muted">待審核</span>
          <span className="value">{pendingPosts.length} 篇</span>
          <span className="small" style={{ color: pendingPosts.length ? 'var(--warn)' : 'var(--ink-3)' }}>{pendingPosts.length ? '等擁有者或管理員核准' : '沒有待審貼文'}</span>
        </Link>
        <Link to="/calendar" className="card stat">
          <span className="small muted">發布失敗</span>
          <span className="value">{failed} 個任務</span>
          <span className="small" style={{ color: failed ? 'var(--err)' : 'var(--ink-3)' }}>{failed ? 'LINE 額度不足，看原因與重試' : '本週沒有失敗'}</span>
        </Link>
      </section>

      {insights.length > 0 && (
        <section className="card card-ai card-pad stack" aria-label="本週重點">
          <AiHeader title="本週重點" note="AI 整理 · 數字取自 10/13–10/19 的每日快照">
            <Link to="/analytics" className="spacer small">看完整成效</Link>
          </AiHeader>
          <ul className="stack" style={{ gap: 6 }}>{insights.map((i) => <li key={i.text}>{i.text}</li>)}</ul>
          <div className="row" style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--accent-wash)', gap: 12 }}>
            <span style={{ flex: '1 1 320px', minWidth: 0 }}>
              <strong style={{ fontWeight: 600 }}>建議：</strong>
              把「@kdanmobile」表現最好的電子簽名教學改寫給其他帳號，排在各帳號過去 30 天互動最高的時段。
            </span>
            <Link to="/compose" className="btn btn-sm">用這個建議開草稿</Link>
          </div>
        </section>
      )}

      <section className="stack" aria-labelledby="h-groups">
        <h2 id="h-groups">各群組</h2>
        <div className="grid" style={{ '--min': '300px' }}>
          {shownGroups.map((g) => (
            <div key={g.id ?? 'none'} className="card">
              <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-soft)', gap: 10 }}>
                <span style={{ fontWeight: 600 }}>{g.name}</span>
                <span className="spacer tiny muted num">{[...new Set(all.filter((a) => (a.group ?? null) === g.id).map((a) => a.tz))].map((z) => `${tzOf(z).short} ${tzOf(z).now}`).join(' · ')}</span>
              </div>
              {all.filter((a) => (a.group ?? null) === g.id).map((a) => {
                const bad = !!state.expired[a.id];
                const note = bad ? ['授權失效', 'var(--err)'] : a.quota && a.quota.used > 50 ? [`額度 ${100 - a.quota.used}%`, 'var(--warn)'] : [`+${a.grow[7]}`, 'var(--ok)'];
                return (
                  <div key={a.id} className="row" style={{ padding: '10px 16px', gap: 10, flexWrap: 'nowrap' }}>
                    <Pf pf={a.pf} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </span>
                    <span className="num" style={{ fontWeight: 500 }}>{fmt(a.followers)}</span>
                    <span className="tiny" style={{ width: 64, textAlign: 'right', color: note[1] }}>{note[0]}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>即將發布</h2>
          <Link to="/calendar" className="small">看行事曆</Link>
        </div>
        {upcoming.map((p) => (
          <div key={p.text} className="list-row">
            <div style={{ width: 96, display: 'flex', flexDirection: 'column' }}>
              <span className="num" style={{ fontWeight: 600 }}>{p.time}</span>
              <span className="tiny muted">{p.day}</span>
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div>{p.text}</div>
              <div className="row" style={{ gap: 4, marginTop: 4 }}>
                {p.accounts.map((id) => { const a = all.find((x) => x.id === id); return <Pf key={id} pf={a.pf} size="sm" bad={!!state.expired[id]} />; })}
                <span className="tiny muted">{p.accounts.length} 個帳號 · 依各帳號時區</span>
              </div>
            </div>
            <Link to={p.status[0] === 'warn' || p.status[0] === 'err' ? '/approvals' : '/calendar'} style={{ color: 'inherit' }}>
              <Chip tone={p.status[0]}>{p.status[1]}</Chip>
            </Link>
          </div>
        ))}
      </section>
      <p className="proto-note">示意：群組名稱是 KDAN 自己取的；{all.length} 個帳號的數字都是假資料。</p>
    </main>
  );
}
