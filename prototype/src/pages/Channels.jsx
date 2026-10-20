import { useState } from 'react';
import { useStore } from '../store.jsx';
import { ACCOUNTS, MARKETS, MARKET_KEYS, fmt } from '../data.js';
import { Icon, Pf, Mk } from '../components/ui.jsx';

const PAGES = [
  { k: 'p1', name: 'KDAN Mobile 台灣', ig: '已加入（台灣）', fixed: true, mk: 'tw' },
  { k: 'p2', name: 'KDAN Mobile', ig: '已加入（美國）', fixed: true, mk: 'us' },
  { k: 'p3', name: 'KDAN Mobile 日本', ig: '已加入（日本）', fixed: true, mk: 'jp' },
  { k: 'p4', name: 'Document 365', ig: '＋ Instagram @document365 · 粉專國家：美國', mk: 'us', accounts: 2 },
  { k: 'p5', name: 'KDAN 台灣徵才', ig: '未綁定 Instagram · 粉專國家：台灣', mk: 'tw', accounts: 1 },
];

function statusOf(a, expired) {
  if (expired) return { label: '授權失效（10/18）', color: 'var(--err)', detail: '可能是授權者改了密碼或被移除粉專權限。2 篇排程貼文受影響。' };
  if (a.quota) return { label: a.quota.used > 50 ? `本月額度已用 ${a.quota.used}%` : '正常', color: a.quota.used > 50 ? 'var(--warn)' : 'var(--ok)', detail: `剩 ${fmt(a.quota.left)} 則；每月 1 日重置`, quota: a.quota.used };
  return { label: '正常', color: 'var(--ok)', detail: '今天 09:00 檢查過，授權有效' };
}

export default function Channels() {
  const { state, reconnect, toast } = useStore();
  const [step, setStep] = useState('start');
  const [picked, setPicked] = useState({ p4: true, p5: false });
  const [assign, setAssign] = useState({ p4: 'us', p5: 'tw' });
  const [lineOpen, setLineOpen] = useState(false);
  const n = PAGES.filter((p) => !p.fixed && picked[p.k]).reduce((c, p) => c + p.accounts, 0);

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>市場與帳號</h1>
          <div className="sub">KDAN Mobile 的帳號依市場分組。每個市場有自己的語言、時區、品牌語氣和審核人。</div>
        </div>
        <button type="button" className="btn" onClick={() => toast('原型：新增市場尚未實作')}>新增市場</button>
      </header>

      {MARKET_KEYS.map((m) => (
        <section key={m} className="card" aria-labelledby={`h-${m}`} style={{ overflow: 'hidden' }}>
          <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', gap: '8px 16px' }}>
            <Mk market={m} dark />
            <h2 id={`h-${m}`}>{MARKETS[m].name}</h2>
            <span className="small" style={{ color: 'var(--ink-2)' }}>{MARKETS[m].langName} · {MARKETS[m].tz}</span>
            <span className="small" style={{ color: 'var(--ink-2)' }}>審核：{MARKETS[m].reviewer}</span>
          </div>
          {ACCOUNTS.filter((a) => a.market === m).map((a) => {
            const expired = !!state.expired[a.id];
            const s = statusOf(a, expired);
            return (
              <div key={a.id} className="list-row" style={{ background: expired ? '#FFFAF9' : '#fff' }}>
                <Pf pf={a.pf} size="lg" />
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="small muted">{a.kind} · {a.pf === 'line' ? '好友' : '追蹤'} {fmt(a.followers)}</div>
                </div>
                <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="row small" style={{ gap: 6, fontWeight: 500, color: s.color }}><span className="dot" style={{ background: s.color }} />{s.label}</span>
                  <span className="tiny" style={{ color: 'var(--ink-2)' }}>{s.detail}</span>
                  {s.quota !== undefined && (
                    <span role="img" aria-label={`本月訊息額度已用 ${s.quota}%`} style={{ height: 6, borderRadius: 3, background: 'var(--line-soft)', overflow: 'hidden', maxWidth: 240, display: 'block' }}>
                      <span style={{ display: 'block', height: 6, width: `${s.quota}%`, background: s.quota > 50 ? 'var(--warn-bar)' : 'var(--ok)' }} />
                    </span>
                  )}
                </div>
                {expired && <button type="button" className="btn btn-danger" onClick={() => reconnect(a.id)}>重新連結</button>}
                <button type="button" className="btn icon-btn" aria-label={`${a.name} 的更多操作`} onClick={() => toast('原型：帳號操作選單尚未實作')}><Icon name="more" /></button>
              </div>
            );
          })}
        </section>
      ))}

      <section className="stack" aria-labelledby="h-add">
        <h2 id="h-add">新增帳號</h2>
        <div className="grid" style={{ '--min': '300px' }}>
          <div className="card card-pad stack" style={{ gridColumn: '1 / -1' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Facebook 粉專＋Instagram</div>
              <div className="small" style={{ color: 'var(--ink-2)' }}>用 Facebook 登入一次，就能把三個市場的粉專一起帶進來；粉專綁定的 IG 商業帳號會跟著加入。</div>
            </div>
            {step === 'start' && (
              <button type="button" className="btn" style={{ alignSelf: 'flex-start', background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600, minHeight: 44 }} onClick={() => setStep('pick')}>用 Facebook 繼續</button>
            )}
            {step === 'pick' && (
              <div className="stack" style={{ gap: 4, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                <div className="small" style={{ fontWeight: 600 }}>選擇要加入的粉專，並指定市場</div>
                <div className="tiny muted" style={{ marginBottom: 6 }}>（原型：略過 Meta 授權畫面）下面是你在 Meta 授權畫面勾選的粉專。市場會依粉專的國家與語言自動建議。</div>
                {PAGES.map((p) => (
                  <div key={p.k} className="row" style={{ minHeight: 48, borderBottom: '1px solid #F1F2F4', gap: 10 }}>
                    <input id={`pg_${p.k}`} type="checkbox" checked={p.fixed || !!picked[p.k]} disabled={p.fixed} onChange={() => setPicked((x) => ({ ...x, [p.k]: !x[p.k] }))} style={{ accentColor: 'var(--accent)', margin: 0 }} />
                    <label htmlFor={`pg_${p.k}`} style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
                      <span style={{ fontWeight: 500, color: p.fixed ? 'var(--ink-3)' : 'var(--ink)' }}>{p.name}</span>
                      <span className="tiny muted">{p.ig}</span>
                    </label>
                    <label htmlFor={`mk_${p.k}`} className="tiny" style={{ color: 'var(--ink-2)' }}>市場</label>
                    <select id={`mk_${p.k}`} className="select" disabled={p.fixed} value={p.fixed ? p.mk : assign[p.k]} onChange={(e) => setAssign((x) => ({ ...x, [p.k]: e.target.value }))} style={{ minHeight: 36, fontSize: 13 }}>
                      {MARKET_KEYS.map((m) => <option key={m} value={m}>{MARKETS[m].name}</option>)}
                    </select>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 10 }}>
                  <button type="button" className="btn" onClick={() => setStep('start')}>取消</button>
                  <button type="button" className="btn btn-primary" disabled={!n} onClick={() => { setStep('start'); toast(`原型：已模擬加入 ${n} 個帳號（不會真的連結）`); }}>{n ? `加入 ${n} 個帳號` : '請至少選一個'}</button>
                </div>
              </div>
            )}
          </div>

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>只連 Instagram</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>IG 沒有綁 Facebook 粉專時用這個。需要是商業或創作者帳號。</div>
            <button type="button" className="btn" style={{ minHeight: 44, fontWeight: 600 }} onClick={() => toast('原型：Instagram 登入尚未實作')}>用 Instagram 登入</button>
          </div>

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>LINE 官方帳號</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>台灣和日本的 LINE 是不同的官方帳號，各自貼一組 Messaging API 憑證。</div>
            {!lineOpen ? (
              <button type="button" className="btn" style={{ minHeight: 44, fontWeight: 600 }} onClick={() => setLineOpen(true)}>貼上 channel 憑證</button>
            ) : (
              <form className="stack" style={{ gap: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }} onSubmit={(e) => { e.preventDefault(); setLineOpen(false); toast('原型：不會送出憑證'); }}>
                <ol className="small stack" style={{ gap: 2, color: 'var(--ink-2)' }}>
                  <li>登入 LINE Developers，選擇官方帳號所屬的 provider</li>
                  <li>建立 Messaging API channel，或打開既有的</li>
                  <li>在「Basic settings」複製 Channel ID 與 Channel secret</li>
                </ol>
                <label htmlFor="mkline" className="small" style={{ fontWeight: 500 }}>市場</label>
                <select id="mkline" className="select" defaultValue="tw"><option value="tw">台灣</option><option value="jp">日本</option></select>
                <label htmlFor="cid" className="small" style={{ fontWeight: 500 }}>Channel ID</label>
                <input id="cid" className="input" placeholder="例：2001234567" autoComplete="off" />
                <label htmlFor="csec" className="small" style={{ fontWeight: 500 }}>Channel secret</label>
                <input id="csec" className="input" type="password" placeholder="32 碼英數字" autoComplete="off" />
                <div className="tiny muted">憑證會加密保存，畫面上不再顯示原文。</div>
                <div className="row">
                  <button type="button" className="btn" onClick={() => setLineOpen(false)}>取消</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>驗證並連結</button>
                </div>
              </form>
            )}
          </div>
        </div>
        <div className="small muted">不支援：Facebook 個人頁、Facebook 社團、Instagram 個人帳號（平台沒有開放發文 API）；LINE VOOM 貼文。</div>
      </section>
    </main>
  );
}
