import { useState } from 'react';
import { Link, navigate } from '../router.jsx';
import { useStore } from '../store.jsx';
import { PF, tzOf } from '../data.js';
import { Icon, Pf, Seg, CheckMark } from '../components/ui.jsx';

const MAIN = (low) => `雙十一優惠預告｜PDF Reader 全方案 5 折\n\n11/11 00:00 開跑，限時 72 小時。年訂閱、團隊方案一起折，結帳自動套用。\n\n${low}，先把日期記起來！`;

// What "AI 改寫給這個帳號" returns per account: the account's own language and platform format.
const AI_FOR = {
  tw_fb: '雙十一優惠預告｜PDF Reader 全方案 5 折\n\n11/11 00:00 開跑，限時 72 小時。年訂閱、團隊方案一起折，結帳自動套用。\n\n活動說明 → kdan.cc/1111',
  tw_ig: '雙十一來了｜PDF Reader 全方案 5 折\n\n11/11 00:00 開跑，只有 72 小時。年訂閱、團隊方案都折，結帳自動套用。\n\n先收藏這篇！',
  tw_line: '【雙十一預告】PDF Reader 全方案 5 折\n11/11 00:00 開跑，限時 72 小時\n活動說明 → kdan.cc/1111',
  us_fb: '11.11 Global Sale: 50% off every PDF Reader plan\n\nStarts Nov 11 at 12:00 AM ET and runs for 72 hours. Annual and team plans included, and the discount applies at checkout.\n\nDetails: kdan.cc/1111-us',
  us_ig: '50% off every PDF Reader plan, for 72 hours only.\n\nThe 11.11 Global Sale starts Nov 11 at 12:00 AM ET. Annual and team plans included.\n\nSave this post so you don’t miss it.',
  jp_fb: '【11.11 セール予告】PDF Reader 全プラン 50% OFF\n\n11月11日 0:00 スタート、72時間限定です。年間プラン・チームプランも対象で、ご購入時に自動適用されます。\n\n詳細はこちら：kdan.cc/1111-jp',
  jp_ig: 'PDF Reader 全プランが 50% OFF になります。\n\n11.11 セールは 11月11日 0:00 から72時間限定。年間プラン・チームプランも対象です。',
  jp_line: '【11.11 セール予告】\nPDF Reader 全プラン 50% OFF\n11/11 0:00〜72時間限定\n詳細：kdan.cc/1111-jp',
};

const SUGGEST = {
  rephrase: '一年一次的雙十一｜PDF Reader 全方案 5 折\n\n11/11 00:00 準時開跑，只有 72 小時。年訂閱、團隊方案通通有折，結帳時自動幫你套用。',
  shorten: 'PDF Reader 全方案 5 折｜11/11 00:00 起限時 72 小時，結帳自動套用。',
  casual: '雙十一要來了！PDF Reader 全部方案直接 5 折，11/11 半夜 12 點開始，只有 3 天，記得設鬧鐘。',
  formal: 'PDF Reader 雙十一優惠：自 11 月 11 日 00:00 起 72 小時內，全方案享 5 折優惠，適用年訂閱與團隊方案，結帳時自動折抵。',
  tags: '#PDFReader（常用，互動中上）\n#雙十一（活動期間搜尋量高）\n#辦公效率（近期互動成長最快）\n#KdanMobile（品牌標籤）',
};
const ACTION_LABEL = { rephrase: '改寫', shorten: '縮短', casual: '更口語', formal: '更正式', tags: '建議標籤', ask: '依你的指示修改' };
const LIMIT = { ig: 2200, line: 5000 };

export default function Compose() {
  const { igTwExpired, reconnect, decide, toast, accounts, groups } = useStore();
  const [main, setMain] = useState(MAIN('史上最低價'));
  const [custom, setCustom] = useState({});
  const [customizing, setCustomizing] = useState(false);
  const [on, setOn] = useState(Object.fromEntries(accounts.map((a) => [a.id, true])));
  const [right, setRight] = useState('ai');
  const [pv, setPv] = useState('tw_fb');
  const [lineFix, setLineFix] = useState(false);
  const [mode, setMode] = useState('local');
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState('');

  const picked = accounts.filter((a) => on[a.id]);
  const textOf = (id) => custom[id] ?? main;
  const groupState = (g) => {
    const list = accounts.filter((a) => a.group === g.id);
    const n = list.filter((a) => on[a.id]).length;
    return n === 0 ? 'none' : n === list.length ? 'all' : 'some';
  };
  const toggleGroup = (g) => {
    const all = groupState(g) === 'all';
    setOn((o) => ({ ...o, ...Object.fromEntries(accounts.filter((a) => a.group === g.id).map((a) => [a.id, !all])) }));
  };

  const runAction = (k) => {
    setRight('ai');
    setAction(k);
    setBusy(true);
    setTimeout(() => setBusy(false), 700);
  };
  const suggestion = action === 'ask' ? `${main}\n\n學生方案也適用。` : action ? SUGGEST[action] : null;

  const hasBanned = [main, ...Object.values(custom)].some((v) => v.includes('史上最低價'));
  const fixBanned = () => {
    setMain((m) => m.replaceAll('史上最低價', '年度最優惠'));
    setCustom((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.replaceAll('史上最低價', '年度最優惠')])));
  };
  const zones = [...new Set(picked.map((a) => a.tz))];

  const checks = [
    hasBanned
      ? { tone: 'err', ai: true, title: '「史上最低價」可能有法規風險', detail: '比較性的最高級用語需要能舉證，建議改成「年度最優惠」。主要文字和個別調整過的帳號會一起改。', action: '套用建議', act: fixBanned }
      : { tone: 'ok', ai: true, title: '用語沒有問題', detail: '沒有發現禁用詞或誇大用語。' },
    on.tw_ig && igTwExpired
      ? { tone: 'err', title: '「@kdanmobile_tw」授權已失效', detail: '內容沒問題，但要先重新連結帳號才能排程。', action: '重新連結', act: () => reconnect('tw_ig') }
      : null,
    on.tw_line && (lineFix
      ? { tone: 'ok', ai: true, title: '「KDAN 官方帳號」額度足夠', detail: '改成圖文卡片，只發給近 90 天有互動的好友（約 1,800 人），預估扣 1,800 則，本月剩 2,060 則。' }
      : { tone: 'err', ai: true, title: '「KDAN 官方帳號」本月訊息額度不夠', detail: '群發 5,430 人 × 2 則（文字＋圖片）＝ 10,860 則，本月只剩 2,060 則。建議改成一張圖文卡片，並只發給近 90 天有互動的好友。', action: '套用建議', act: () => setLineFix(true) }),
    zones.length > 1 && mode === 'local'
      ? { tone: 'warn', ai: true, title: `選到的帳號分在 ${zones.length} 個時區`, detail: '「依各帳號時區」會讓每個帳號在自己的 20:00 發出，最早和最晚相差 13 小時。內文寫的「11/11 00:00 開跑」也會依讀者時區理解不同。' }
      : null,
    { tone: 'ok', title: '其他帳號：可以發布', detail: 'IG 每篇都有圖片，替代文字已產生。' },
  ].filter(Boolean);
  const blocking = checks.filter((c) => c.tone === 'err').length;

  const submit = () => {
    decide('p1', 'wait');
    toast(`已送出審核：${picked.length} 個帳號`);
    navigate('/approvals');
  };

  const pvAcc = accounts.find((a) => a.id === pv && on[a.id]) ?? picked[0];
  const pvText = pvAcc ? textOf(pvAcc.id) : main;
  const pvTime = (a) => (mode === 'local' ? '20:00' : { 'Asia/Taipei': '20:00', 'Asia/Singapore': '20:00', 'America/New_York': '08:00', 'Asia/Tokyo': '21:00', 'Europe/London': '13:00' }[a.tz]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="row" style={{ padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', gap: 12 }}>
        <Link to="/" className="btn icon-btn" aria-label="返回總覽" style={{ border: 0 }}><Icon name="chevronLeft" size={20} stroke={2} /></Link>
        <h1 style={{ fontSize: 18 }}>新增貼文</h1>
        <span className="chip chip-neutral">草稿 · 已自動儲存</span>
        <button type="button" className="chip" style={{ border: '1px dashed #B8BEC7', background: '#fff', height: 28 }}>標籤：雙十一 ＋</button>
        <span className="spacer small muted">KDAN Mobile</span>
      </header>

      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap' }}>
        <section aria-label="編輯內容" style={{ flex: '999 1 600px', minWidth: 0, padding: '24px 28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>發到哪些帳號</span>
              <span className="small muted">已選 {picked.length} 個帳號</span>
            </div>
            <div className="row" style={{ gap: 6 }} aria-label="用群組快速選取">
              <span className="tiny muted" style={{ marginRight: 2 }}>群組</span>
              {groups.map((g) => {
                const s = groupState(g);
                return (
                  <button key={g.id} type="button" className="pill" aria-pressed={s === 'all'} aria-selected={s === 'all'} onClick={() => toggleGroup(g)}>
                    {g.name}{s === 'some' ? '（部分）' : ''}
                  </button>
                );
              })}
              <button type="button" className="pill" aria-selected={picked.length === accounts.length} onClick={() => setOn(Object.fromEntries(accounts.map((a) => [a.id, picked.length !== accounts.length])))}>全部</button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {accounts.map((a) => {
                const bad = a.id === 'tw_ig' && igTwExpired;
                const sel = on[a.id];
                return (
                  <button key={a.id} type="button" aria-pressed={sel} title={a.name} onClick={() => setOn((o) => ({ ...o, [a.id]: !o[a.id] }))}
                    className="row" style={{ gap: 6, minHeight: 40, padding: '0 10px 0 6px', borderRadius: 20, flexWrap: 'nowrap', border: `1px solid ${sel ? (bad ? '#E9A39C' : 'var(--accent)') : 'var(--line)'}`, background: sel ? (bad ? '#FFFAF9' : '#F7F9FF') : '#fff', opacity: sel ? 1 : 0.55 }}>
                    <Pf pf={a.pf} bad={bad} />
                    <span className="small">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ padding: '14px 16px 0' }}>
              <span style={{ fontWeight: 600 }}>主要文字</span>
              <span className="tiny muted">{customizing ? `沒有個別調整的帳號用這段（${picked.filter((a) => custom[a.id] === undefined).length} 個）` : `會發到選取的 ${picked.length} 個帳號`}</span>
            </div>
            <label htmlFor="caption" className="sr-only">主要文字</label>
            <textarea id="caption" rows={7} value={main} onChange={(e) => setMain(e.target.value)} style={{ margin: '10px 16px 0', padding: 0, border: 0, resize: 'vertical', fontSize: 15, lineHeight: 1.65, outline: 'none' }} />
            <div className="row" style={{ padding: '12px 16px', gap: 10, alignItems: 'flex-end' }}>
              <div role="img" aria-label="圖片 1" style={{ width: 80, height: 80, borderRadius: 8, background: '#DCE3F5' }} />
              <div role="img" aria-label="圖片 2" style={{ width: 80, height: 80, borderRadius: 8, background: '#E8E1F2' }} />
              <button type="button" onClick={() => toast('原型：上傳媒體尚未實作')} style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed #B8BEC7', background: '#FAFBFC', fontSize: 12, color: 'var(--ink-2)' }}>加入媒體</button>
              <span className="tiny" style={{ color: 'var(--ink-2)' }}>替代文字：AI 已產生 2 張</span>
            </div>
            <div className="row" style={{ padding: '10px 16px', borderTop: '1px solid var(--line-soft)', gap: 6 }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="spark" size={16} /></span>
              {['rephrase', 'shorten', 'casual', 'formal', 'tags'].map((k) => (
                <button key={k} type="button" className="btn btn-sm" onClick={() => runAction(k)}>{ACTION_LABEL[k]}</button>
              ))}
              <span className="spacer small muted num">{main.length} 字</span>
            </div>
          </div>

          {!customizing ? (
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setCustomizing(true)}>
              個別調整每個帳號<Icon name="chevronRight" size={16} />
            </button>
          ) : (
            <section className="stack" aria-labelledby="h-each">
              <div className="row">
                <h2 id="h-each" style={{ fontSize: 16 }}>個別調整</h2>
                <span className="tiny muted">先帶入主要文字；改過的帳號不會再跟著主要文字變動。</span>
                <button type="button" className="btn btn-sm spacer" onClick={() => { setCustom(Object.fromEntries(picked.map((a) => [a.id, AI_FOR[a.id]]))); toast(`AI 已依各帳號的語言和平台格式改寫 ${picked.length} 個帳號`); }}>
                  <Icon name="spark" size={14} />AI 依帳號改寫全部
                </button>
              </div>
              <div className="grid" style={{ '--min': '300px' }}>
                {picked.map((a) => {
                  const own = custom[a.id] !== undefined;
                  const text = textOf(a.id);
                  return (
                    <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', borderColor: own ? 'var(--accent-line)' : 'var(--line)' }}>
                      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', gap: 8, flexWrap: 'nowrap' }}>
                        <Pf pf={a.pf} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 500 }}>{a.name}</span>
                          <span className="tiny muted">{PF[a.pf].name} · {tzOf(a.tz).short}</span>
                        </span>
                        <span className="tiny" style={{ fontWeight: 600, color: own ? 'var(--accent)' : 'var(--ink-3)' }}>{own ? '已調整' : '主要文字'}</span>
                      </div>
                      <label htmlFor={`t-${a.id}`} className="sr-only">{a.name} 的內容</label>
                      <textarea id={`t-${a.id}`} rows={6} value={text} onChange={(e) => setCustom((c) => ({ ...c, [a.id]: e.target.value }))} onFocus={() => setPv(a.id)}
                        style={{ margin: '10px 14px 0', padding: 0, border: 0, resize: 'vertical', fontSize: 14, lineHeight: 1.6, outline: 'none', color: own ? 'var(--ink)' : 'var(--ink-2)' }} />
                      {a.pf === 'ig' && (
                        <div className="row" style={{ padding: '8px 14px 0' }}>
                          <label htmlFor={`fc-${a.id}`} className="tiny" style={{ color: 'var(--ink-2)' }}>第一則留言</label>
                          <input id={`fc-${a.id}`} className="input" placeholder="例如標籤" style={{ flex: 1, minHeight: 32, fontSize: 13 }} />
                        </div>
                      )}
                      {a.pf === 'line' && (
                        <div className="row tiny" style={{ padding: '8px 14px 0', gap: 6 }}>
                          <span style={{ color: 'var(--ink-2)' }}>發送對象</span>
                          <span className="chip chip-plan" style={{ height: 26 }}>{a.id === 'tw_line' && lineFix ? '近 90 天有互動（約 1,800 人）' : `全部好友（${a.followers.toLocaleString('en-US')} 人）`}</span>
                        </div>
                      )}
                      <div className="row" style={{ padding: '10px 14px', gap: 6, marginTop: 'auto' }}>
                        <button type="button" className="btn btn-sm" onClick={() => { setCustom((c) => ({ ...c, [a.id]: AI_FOR[a.id] })); setPv(a.id); }}><Icon name="spark" size={14} />AI 改寫給這個帳號</button>
                        {own && <button type="button" className="btn btn-sm" onClick={() => setCustom((c) => { const n = { ...c }; delete n[a.id]; return n; })}>改回主要文字</button>}
                        <span className="spacer tiny muted num">{text.length}{LIMIT[a.pf] ? ` / ${LIMIT[a.pf].toLocaleString('en-US')}` : ''} 字</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="card card-pad stack">
            <div className="row">
              <h3>發布前檢查</h3>
              <span className="tiny muted">平台規則＋AI 檢查，涵蓋所有選取的帳號</span>
            </div>
            {checks.map((c) => (
              <div key={c.title} className="check">
                <CheckMark tone={c.tone} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}><span style={{ fontWeight: 500 }}>{c.title}</span>{c.ai && <span className="ai-tag">AI</span>}</div>
                  <div className="small" style={{ color: 'var(--ink-2)' }}>{c.detail}</div>
                </div>
                {c.action && <button type="button" className="btn btn-sm" onClick={c.act}>{c.action}</button>}
              </div>
            ))}
          </div>
        </section>

        <aside style={{ flex: '1 1 400px', minWidth: 0, padding: '20px 24px 32px', background: '#ECEEF1', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Seg label="右側面板" value={right} onChange={setRight} options={[['ai', 'AI 助理'], ['preview', '預覽']]} />

          {right === 'ai' && (
            <div className="stack">
              <div className="row small">
                <span style={{ color: 'var(--ink-2)' }}>品牌語氣</span>
                <span className="chip" style={{ background: '#fff', border: '1px solid var(--control)', height: 30 }}>KDAN Mobile</span>
                <Link to="/voice">編輯</Link>
              </div>

              <div className="card card-pad stack" style={{ border: 0, gap: 10 }}>
                {!action && (
                  <>
                    <div style={{ fontWeight: 600 }}>快速調整</div>
                    <div className="small" style={{ color: 'var(--ink-2)' }}>點編輯區下方的「改寫」「縮短」等按鈕，或在下面直接告訴 AI 想怎麼改。結果會先放在這裡，你決定要不要套用。要給不同帳號不同的文字，用「個別調整每個帳號」。</div>
                  </>
                )}
                {action && (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{ACTION_LABEL[action]}</span>
                      <span className="tiny muted">主要文字</span>
                    </div>
                    <div className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line', minHeight: 60, color: busy ? 'var(--ink-3)' : 'var(--ink)' }}>
                      {busy ? '產生中…' : suggestion}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {action === 'tags'
                        ? <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => { toast('標籤已放進 IG 第一則留言'); setAction(null); }}>放進 IG 第一則留言</button>
                        : <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => { setMain(suggestion); setAction(null); toast('已取代主要文字'); }}>取代內容</button>}
                      {action !== 'tags' && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setMain(`${main}\n\n${suggestion}`); setAction(null); }}>插在後面</button>}
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => runAction(action)}>再試一次</button>
                    </div>
                  </>
                )}
              </div>

              <form className="card card-pad stack" style={{ border: 0, gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (ask.trim()) { runAction('ask'); setAsk(''); } }}>
                <label htmlFor="ask" style={{ fontWeight: 600 }} className="small">想怎麼改？</label>
                <textarea id="ask" className="textarea small" rows={2} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="例：加一句「學生方案也適用」，語氣再客氣一點" />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="tiny muted">改的是主要文字</span>
                  <button type="submit" className="btn btn-sm btn-dark">送出</button>
                </div>
              </form>
              <div className="tiny" style={{ color: 'var(--ink-2)' }}>AI 產生的內容可能有誤，送審前請確認。AI 不會自行發布或排程。</div>
            </div>
          )}

          {right === 'preview' && pvAcc && (
            <div className="stack">
              <label className="row small" style={{ gap: 8 }}>
                <span style={{ color: 'var(--ink-2)' }}>預覽帳號</span>
                <select className="select" value={pvAcc.id} onChange={(e) => setPv(e.target.value)} style={{ minHeight: 34, fontSize: 13, flex: 1 }}>
                  {picked.map((a) => <option key={a.id} value={a.id}>{PF[a.pf].name} · {a.name}{custom[a.id] !== undefined ? '（已調整）' : ''}</option>)}
                </select>
              </label>
              {pvAcc.pf === 'line' ? (
                <div style={{ background: '#8CABD9', borderRadius: 10, padding: '16px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="brand-mark" style={{ borderRadius: 16, width: 32, height: 32 }} aria-hidden="true">K</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '82%' }}>
                    <div className="small" style={{ background: '#fff', borderRadius: 14, padding: '10px 12px', whiteSpace: 'pre-line' }}>{pvText}</div>
                    <div aria-hidden="true" style={{ width: 180, aspectRatio: '1', borderRadius: 14, background: '#DCE3F5' }} />
                  </div>
                </div>
              ) : (
                <div className="card" style={{ border: 0, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,24,30,.08)' }}>
                  <div className="row" style={{ padding: '12px 14px', gap: 10 }}>
                    <span className="brand-mark" style={{ borderRadius: 17, width: 34, height: 34 }} aria-hidden="true">K</span>
                    <div><div style={{ fontWeight: 600 }}>{pvAcc.name}</div><div className="tiny muted">10/20 {pvTime(pvAcc)}（{tzOf(pvAcc.tz).short}）</div></div>
                  </div>
                  <div style={{ padding: '0 14px 12px', whiteSpace: 'pre-line' }}>{pvText}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <div aria-hidden="true" style={{ aspectRatio: '1', background: '#DCE3F5' }} />
                    <div aria-hidden="true" style={{ aspectRatio: '1', background: '#E8E1F2' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="row compose-footer" style={{ padding: '12px 24px', background: 'var(--surface)', borderTop: '1px solid var(--line)', gap: '10px 14px', position: 'sticky', bottom: 0 }}>
        <Seg role="radio" label="發布時間的基準" value={mode} onChange={setMode} options={[['local', '依各帳號時區'], ['same', '同一時刻']]} />
        <span className="small num">
          {mode === 'local'
            ? `10/20 20:00，各帳號自己的時間（${zones.map((z) => tzOf(z).short).join('、')}）`
            : `台北 10/20 20:00 ＝ ${zones.filter((z) => z !== 'Asia/Taipei').map((z) => `${tzOf(z).short} ${pvTime({ tz: z })}`).join(' · ') || '只有台北時區'}`}
        </span>
        <div className="row spacer">
          <span className="tiny" style={{ color: blocking ? 'var(--err)' : 'var(--ink-3)' }}>{blocking ? `還有 ${blocking} 項要處理才能送審` : '送出後由擁有者或管理員核准'}</span>
          <button type="button" className="btn" onClick={() => toast('草稿已儲存')}>儲存草稿</button>
          <button type="button" className="btn btn-primary" disabled={blocking > 0 || picked.length === 0} onClick={submit}>送出審核（{picked.length} 個帳號）</button>
        </div>
      </footer>
    </div>
  );
}
