import { useState } from 'react';
import { useStore } from '../store.jsx';
import { APPROVAL_ITEMS, PF, tzOf } from '../data.js';
import { Pf, Chip, GroupTag } from '../components/ui.jsx';

// One decision per post, as Assembly's approvals inbox and Later's "Request Changes" card.
const DEC = { ok: ['ok', '已核准'], wait: ['warn', '待審核'], chg: ['err', '要求修改'] };

export default function Approvals() {
  const { state, decide, addComment, toast, accounts, groupName } = useStore();
  const [item, setItem] = useState('p1');
  const [draft, setDraft] = useState('');

  const d = APPROVAL_ITEMS[item];
  const decision = state.decisions[item];
  const targets = Object.entries(d.accounts).map(([id, custom]) => ({ a: accounts.find((x) => x.id === id), custom }));
  const comments = [...d.comments, ...(state.comments[item] || [])];
  const activity = [
    { who: d.submittedBy, when: d.submittedAt, text: `送出審核，${targets.length} 個帳號，其中 ${targets.filter((t) => t.custom).length} 個有個別調整` },
  ];

  const act = (value) => {
    if (value === 'chg' && !draft.trim()) {
      toast('要求修改時請寫下要改的地方');
      document.getElementById('cmt')?.focus();
      return;
    }
    if (draft.trim()) {
      addComment(item, { initial: '你', who: '你', when: '剛剛', text: draft.trim() });
      setDraft('');
    }
    decide(item, value);
    toast(value === 'ok' ? `已核准「${d.title}」，${targets.length} 個帳號會照排程發布` : '已退回，送審人會收到通知');
  };

  const row = (k, it) => {
    const sel = k === item;
    const [tone, label] = DEC[state.decisions[k]];
    return (
      <button key={k} type="button" aria-pressed={sel} onClick={() => setItem(k)}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', border: 0, borderBottom: '1px solid var(--line-soft)', background: sel ? '#F7F9FF' : '#fff', boxShadow: sel ? 'inset 3px 0 0 var(--accent)' : 'none', textAlign: 'left' }}>
        <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{it.title}</span><Chip tone={tone}>{label}</Chip></span>
        <span className="tiny muted">{it.submittedBy} · {it.submittedAt} 送出 · 第一則 {it.firstRun}</span>
        <span className="row" style={{ gap: 4 }}>
          {Object.keys(it.accounts).map((id) => { const a = accounts.find((x) => x.id === id); return <Pf key={id} pf={a.pf} size="sm" bad={!!state.expired[id]} />; })}
          <span className="tiny muted">{Object.keys(it.accounts).length} 個帳號</span>
        </span>
      </button>
    );
  };
  const waiting = Object.entries(APPROVAL_ITEMS).filter(([k]) => state.decisions[k] !== 'ok');
  const done = Object.entries(APPROVAL_ITEMS).filter(([k]) => state.decisions[k] === 'ok');

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>待審核</h1>
          <div className="sub">編輯送出的貼文，由擁有者或管理員核准後才會進排程。一篇貼文核准一次，涵蓋它的所有帳號。</div>
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section className="card" aria-label="送審清單" style={{ flex: '1 1 280px', maxWidth: 380, overflow: 'hidden' }}>
          <div className="tiny muted" style={{ padding: '12px 16px 6px', fontWeight: 600 }}>等你核准 {waiting.length}</div>
          {waiting.map(([k, it]) => row(k, it))}
          {waiting.length === 0 && <div className="small muted" style={{ padding: '4px 16px 12px' }}>都處理完了。</div>}
          {done.length > 0 && <div className="tiny muted" style={{ padding: '12px 16px 6px', fontWeight: 600 }}>已核准</div>}
          {done.map(([k, it]) => row(k, it))}
        </section>

        <section aria-label="審核內容" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'baseline', gap: '8px 12px' }}>
              <h2 style={{ fontSize: 18 }}>{d.title}</h2>
              <span className="small muted">{d.submittedBy} · {d.submittedAt}</span>
            </div>
            <div className="tiny muted">主要文字</div>
            <div className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line' }}>{d.body}</div>
          </div>

          <div className="grid" style={{ '--min': '260px' }}>
            {targets.map(({ a, custom }) => (
              <div key={a.id} className="card" style={{ overflow: 'hidden' }}>
                <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', gap: 8, flexWrap: 'nowrap' }}>
                  <Pf pf={a.pf} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 500 }}>{a.name}</span>
                    <span className="tiny muted">{PF[a.pf].name} · {tzOf(a.tz).short} {item === 'p1' ? '10/20 20:00' : '10/22 21:00'}</span>
                  </span>
                  <GroupTag name={a.group ? groupName(a.group) : null} />
                </div>
                <div aria-hidden="true" style={{ height: 110, background: '#DCE3F5' }} />
                <div className="stack" style={{ padding: '10px 14px 14px', gap: 6 }}>
                  <span className="tiny" style={{ fontWeight: 600, color: custom ? 'var(--accent)' : 'var(--ink-3)' }}>{custom ? '個別調整過' : '使用主要文字'}</span>
                  <div className="small" style={{ whiteSpace: 'pre-line' }}>{custom ?? d.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card card-pad stack">
            <h3>留言與紀錄</h3>
            {activity.map((x) => <div key={x.text} className="tiny muted">{x.who} {x.text} · {x.when}</div>)}
            {comments.length === 0 && <div className="small muted">還沒有留言。</div>}
            {comments.map((c, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10 }}>
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 15, background: 'var(--line-soft)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{c.initial}</span>
                <div>
                  <div className="small"><strong style={{ fontWeight: 600 }}>{c.who}</strong> <span className="muted">{c.when}</span></div>
                  <div className="small">{c.text}</div>
                </div>
              </div>
            ))}
            <label htmlFor="cmt" className="sr-only">留言</label>
            <textarea id="cmt" className="textarea small" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="寫下要修改的地方；送出後會通知送審人" />
          </div>

          <div className="card row" style={{ padding: '12px 16px', gap: 10 }}>
            <span className="small" style={{ flex: '1 1 240px', color: 'var(--ink-2)' }}>
              {decision === 'ok' ? '已核准，貼文已進入排程。' : `核准後 ${targets.length} 個帳號會依各自的時區發布。`}
            </span>
            <button type="button" className="btn" onClick={() => act('chg')}>要求修改</button>
            <button type="button" className="btn btn-ok" disabled={decision === 'ok'} onClick={() => act('ok')}>{decision === 'ok' ? '已核准' : '核准'}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
