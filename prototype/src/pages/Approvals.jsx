import { useState } from 'react';
import { useStore } from '../store.jsx';
import { APPROVAL_ITEMS, MARKETS } from '../data.js';
import { Pf, Mk, Chip, AiHeader } from '../components/ui.jsx';

const DEC = { ok: ['ok', '已核准'], wait: ['warn', '待審核'], chg: ['err', '要求修改'] };
const WHO = { tw: '台灣行銷主管', us: '你（US Marketing）', jp: '日本マーケティング担当' };

export default function Approvals() {
  const { state, decide, addComment, toast } = useStore();
  const [item, setItem] = useState('p1');
  const [market, setMarket] = useState('us');
  const [draft, setDraft] = useState('');

  const d = APPROVAL_ITEMS[item];
  const markets = Object.keys(d.versions);
  const mk = markets.includes(market) ? market : markets[0];
  const decisions = state.decisions[item];
  const key = `${item}_${mk}`;
  const comments = [...(d.comments[mk] || []), ...(state.comments[key] || [])];
  const allOk = markets.every((m) => decisions[m] === 'ok');

  const act = (value) => {
    if (value === 'chg' && !draft.trim()) {
      toast('要求修改時請寫下要改的地方');
      document.getElementById('cmt')?.focus();
      return;
    }
    if (draft.trim()) {
      addComment(key, { initial: '你', who: WHO[mk].replace('你（', '').replace('）', ''), when: '剛剛', lang: 'zh-Hant-TW', text: draft.trim() });
      setDraft('');
    }
    decide(item, mk, value);
    toast(value === 'ok' ? `已核准${MARKETS[mk].name}版本` : `已退回${MARKETS[mk].name}版本，送審人會收到通知`);
  };

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>待審核</h1>
          <div className="sub">每個市場的版本由各自的負責人核准；全部核准後才會進排程。</div>
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section className="card" aria-label="送審清單" style={{ flex: '1 1 280px', maxWidth: 360, overflow: 'hidden' }}>
          {Object.entries(APPROVAL_ITEMS).map(([k, it]) => {
            const sel = k === item;
            return (
              <button key={k} type="button" aria-pressed={sel} onClick={() => { setItem(k); setMarket(Object.keys(it.versions).find((m) => state.decisions[k][m] !== 'ok') || Object.keys(it.versions)[0]); }}
                style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', border: 0, borderBottom: '1px solid var(--line-soft)', background: sel ? '#F7F9FF' : '#fff', boxShadow: sel ? 'inset 3px 0 0 var(--accent)' : 'none', textAlign: 'left' }}>
                <span style={{ fontWeight: 600 }}>{it.title}</span>
                <span className="tiny muted">{it.meta}</span>
                <span className="row" style={{ gap: 4 }}>
                  {Object.keys(it.versions).map((m) => <Chip key={m} tone={DEC[state.decisions[k][m]][0]}><strong>{MARKETS[m].code}</strong>{DEC[state.decisions[k][m]][1]}</Chip>)}
                </span>
              </button>
            );
          })}
        </section>

        <section aria-label="審核內容" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card-pad stack">
            <div className="row" style={{ alignItems: 'baseline', gap: '8px 12px' }}>
              <h2 style={{ fontSize: 18 }}>{d.title}</h2>
              <span className="small muted">{d.meta}</span>
            </div>
            <div className="grid" style={{ '--min': '200px', gap: 8 }}>
              {markets.map((m) => {
                const on = m === mk;
                const [tone, label] = DEC[decisions[m]];
                return (
                  <button key={m} type="button" aria-pressed={on} onClick={() => setMarket(m)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 10, border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? '#F7F9FF' : '#fff', textAlign: 'left' }}>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Mk market={m} />{MARKETS[m].name}<span className="spacer tiny" style={{ fontWeight: 600, color: `var(--${tone})` }}>{label}</span></span>
                    <span className="tiny muted">{WHO[m]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {(d.diff[mk] || []).length > 0 && (
            <div className="card card-ai card-pad stack" style={{ gap: 8 }}>
              <AiHeader title="和台灣原稿的差異" note="AI 整理，給不懂中文的審核人看" />
              <ul lang={MARKETS[mk].lang} className="small stack" style={{ gap: 4 }}>{d.diff[mk].map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}

          <div className="grid" style={{ '--min': '260px' }}>
            {d.versions[mk].map(([pf, account, text]) => (
              <div key={pf} className="card" style={{ overflow: 'hidden' }}>
                <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)' }}><Pf pf={pf} /><span style={{ fontWeight: 500 }}>{account}</span></div>
                <div aria-hidden="true" style={{ height: 120, background: '#DCE3F5' }} />
                <div lang={MARKETS[mk].lang} className="small" style={{ padding: '12px 14px', whiteSpace: 'pre-line' }}>{text}</div>
              </div>
            ))}
          </div>

          <div className="card card-pad stack">
            <h3>留言</h3>
            {comments.length === 0 && <div className="small muted">還沒有留言。</div>}
            {comments.map((c, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10 }}>
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 15, background: 'var(--line-soft)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{c.initial}</span>
                <div>
                  <div className="small"><strong style={{ fontWeight: 600 }}>{c.who}</strong> <span className="muted">{c.when}</span></div>
                  <div lang={c.lang} className="small">{c.text}</div>
                  {c.tr && <div className="tiny" style={{ color: 'var(--ink-2)', marginTop: 2 }}>AI 翻譯：{c.tr}</div>}
                </div>
              </div>
            ))}
            <label htmlFor="cmt" className="sr-only">留言</label>
            <textarea id="cmt" className="textarea small" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="寫下要修改的地方；送出後會通知送審人" />
          </div>

          <div className="card row" style={{ padding: '12px 16px', gap: 10 }}>
            <span className="small" style={{ flex: '1 1 240px', color: 'var(--ink-2)' }}>
              {allOk ? '所有市場都已核准，貼文已進入排程。' : `核准後只放行${MARKETS[mk].name}的 ${d.versions[mk].length} 個帳號；其他市場等各自的負責人核准。`}
            </span>
            <button type="button" className="btn" onClick={() => act('chg')}>要求修改</button>
            <button type="button" className="btn btn-ok" disabled={decisions[mk] === 'ok'} onClick={() => act('ok')}>
              {decisions[mk] === 'ok' ? `${MARKETS[mk].name}版本已核准` : `核准${MARKETS[mk].name}版本`}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
