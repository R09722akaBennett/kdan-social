import { useState } from 'react';
import { Link } from '../router.jsx';
import { useStore } from '../store.jsx';
import { ACCOUNTS, MARKETS, MARKET_KEYS, APPROVAL_ITEMS, fmt } from '../data.js';
import { Icon, Pf, Mk, Seg, Chip, MARKET_FILTER, AiHeader } from '../components/ui.jsx';

const INSIGHTS = {
  tw: '台灣 IG 授權失效 2 天，期間沒有新貼文；FB 互動率 4.1%，和上週持平。',
  us: '美國 IG 觸及比上週高 38%，主要來自 10/17 的電子簽名教學 Reels。',
  jp: '日本 LINE 開封率 61%，是三個市場最高；同一則內容在日本 FB 的互動率只有 1.2%。',
};

const NEXT = { tw: '今天 20:00 雙十一預告', us: '10/20 20:00 EDT 11.11 Global Sale', jp: '10/20 20:00 JST 11.11 セール予告' };

export default function Overview() {
  const [mk, setMk] = useState('all');
  const { igTwExpired, reconnect, state, pendingItems } = useStore();
  const shownMarkets = mk === 'all' ? MARKET_KEYS : [mk];
  const accounts = ACCOUNTS.filter((a) => shownMarkets.includes(a.market));
  const total = accounts.reduce((s, a) => s + a.followers, 0);
  const grow = accounts.reduce((s, a) => s + a.grow[7], 0);

  const waitingMarkets = pendingItems.flatMap((k) => Object.entries(state.decisions[k]).filter(([m, d]) => d !== 'ok' && shownMarkets.includes(m)).map(([m]) => `${k}_${m}`));
  const pendingPosts = new Set(waitingMarkets.map((x) => x.split('_')[0])).size;
  const published = { all: [16, 38], tw: [6, 14], us: [5, 10], jp: [5, 14] }[mk];
  const failed = { all: 1, tw: 1, us: 0, jp: 0 }[mk];

  const decisionChip = (item, m) => {
    const d = state.decisions[item][m];
    if (d === 'ok') return ['ok', '已核准'];
    if (d === 'chg') return ['err', '要求修改'];
    return ['warn', '待審核'];
  };
  const upcoming = [
    { time: '20:00', day: '今天', text: '雙十一優惠預告：PDF Reader 全方案 5 折', markets: [
      ['tw', ...(igTwExpired ? ['err', 'IG 會失敗'] : ['plan', '已排程'])],
      ['jp', ...decisionChip('p1', 'jp')],
    ] },
    { time: '08:00', day: '10/21 週三', text: '11.11 Global Sale（美國當地 10/20 20:00）', markets: [['us', ...decisionChip('p1', 'us')]] },
    { time: '20:00', day: '10/22 週四', text: '新功能：AI 摘要支援長文件（日本當地 21:00）', markets: [['jp', ...decisionChip('p2', 'jp')]] },
    { time: '12:00', day: '10/22 週四', text: '小技巧：一鍵把照片轉成可搜尋的 PDF', markets: [['tw', 'plan', '已排程'], ['us', 'plan', '已排程']] },
  ].map((p) => ({ ...p, markets: p.markets.filter(([m]) => shownMarkets.includes(m)) })).filter((p) => p.markets.length);

  const insights = mk === 'all' ? [INSIGHTS.us, INSIGHTS.jp, ...(igTwExpired ? [INSIGHTS.tw] : [])] : [INSIGHTS[mk]];

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>總覽</h1>
          <div className="sub">KDAN Mobile · 10 月 20 日 星期二 · 以台北時間顯示</div>
        </div>
        <div className="row">
          <Seg label="市場" value={mk} onChange={setMk} options={MARKET_FILTER} />
          <Link to="/compose" className="btn btn-primary">新增貼文</Link>
        </div>
      </header>

      {igTwExpired && (mk === 'all' || mk === 'tw') && (
        <section className="alert" aria-label="需要處理">
          <span style={{ color: 'var(--err)', display: 'flex' }}><Icon name="alert" size={20} stroke={2} /></span>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <div className="title">台灣 Instagram「@kdanmobile_tw」的授權已在 10/18 失效</div>
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
          <span className="value">{pendingPosts} 篇</span>
          <span className="small" style={{ color: pendingPosts ? 'var(--warn)' : 'var(--ink-3)' }}>{pendingPosts ? `${waitingMarkets.length} 個市場版本等核准` : '沒有待審貼文'}</span>
        </Link>
        <Link to="/calendar" className="card stat">
          <span className="small muted">發布失敗</span>
          <span className="value">{failed} 個任務</span>
          <span className="small" style={{ color: failed ? 'var(--err)' : 'var(--ink-3)' }}>{failed ? 'LINE 額度不足，看原因與重試' : '本週沒有失敗'}</span>
        </Link>
      </section>

      <section className="card card-ai card-pad stack" aria-label="本週重點">
        <AiHeader title="本週重點" note="AI 整理 · 數字取自 10/13–10/19 的每日快照">
          <Link to="/analytics" className="spacer small">看完整成效</Link>
        </AiHeader>
        <ul className="stack" style={{ gap: 6 }}>{insights.map((t) => <li key={t}>{t}</li>)}</ul>
        <div className="row" style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--accent-wash)', gap: 12 }}>
          <span style={{ flex: '1 1 320px', minWidth: 0 }}>
            <strong style={{ fontWeight: 600 }}>建議：</strong>
            {mk === 'tw' ? '先重新連結 IG，再把美國表現最好的電子簽名教學 Reels 改成繁中版，排在週四 20:00。' : '把美國表現最好的電子簽名教學改成日文版 Reels，排在日本週四 21:00（過去 30 天日本 IG 互動最高的時段）。'}
          </span>
          <Link to="/compose" className="btn btn-sm">用這個建議開草稿</Link>
        </div>
      </section>

      <section className="stack" aria-labelledby="h-markets">
        <h2 id="h-markets">各市場</h2>
        <div className="grid" style={{ '--min': '300px' }}>
          {shownMarkets.map((m) => (
            <div key={m} className="card">
              <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-soft)', gap: 10 }}>
                <Mk market={m} dark />
                <span style={{ fontWeight: 600 }}>{MARKETS[m].name}</span>
                <span className="spacer tiny muted num">當地 {MARKETS[m].localTime}</span>
              </div>
              {ACCOUNTS.filter((a) => a.market === m).map((a) => {
                const bad = a.id === 'tw_ig' && igTwExpired;
                const note = bad ? ['授權失效', 'var(--err)'] : a.id === 'tw_line' ? ['額度 38%', 'var(--warn)'] : [`+${a.grow[7]}`, 'var(--ok)'];
                return (
                  <div key={a.id} className="row" style={{ padding: '10px 16px', gap: 10, flexWrap: 'nowrap' }}>
                    <Pf pf={a.pf} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span className="num" style={{ fontWeight: 500 }}>{fmt(a.followers)}</span>
                    <span className="tiny" style={{ width: 64, textAlign: 'right', color: note[1] }}>{note[0]}</span>
                  </div>
                );
              })}
              <div className="small" style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--line-soft)', color: 'var(--ink-2)' }}>下一篇：{NEXT[m]}</div>
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
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>{p.text}</div>
            <div className="row" style={{ gap: 6 }}>
              {p.markets.map(([m, tone, label]) => (
                <Link key={m} to={tone === 'warn' || (tone === 'err' && label === '要求修改') ? '/approvals' : '/calendar'} style={{ color: 'inherit' }}>
                  <Chip tone={tone}><strong>{MARKETS[m].code}</strong>{label}</Chip>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
      <p className="proto-note">示意：{Object.keys(APPROVAL_ITEMS).length} 篇送審中的貼文、8 個帳號的數字都是假資料。</p>
    </main>
  );
}
