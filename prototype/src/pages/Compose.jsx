import { useState } from 'react';
import { Link, navigate } from '../router.jsx';
import { useStore } from '../store.jsx';
import { ACCOUNTS, MARKETS, MARKET_KEYS, PF } from '../data.js';
import { Icon, Pf, Seg, CheckMark } from '../components/ui.jsx';

const TW_SHARED = (low) => `雙十一優惠預告｜PDF Reader 全方案 5 折\n\n11/11 00:00 開跑，限時 72 小時。年訂閱、團隊方案一起折，結帳自動套用。\n\n${low}，先把日期記起來！`;

const INITIAL_TEXT = {
  tw: {
    shared: TW_SHARED('史上最低價'),
    fb: '雙十一優惠預告｜PDF Reader 全方案 5 折\n\n11/11 00:00 開跑，限時 72 小時。年訂閱、團隊方案一起折，結帳自動套用。史上最低價，先把日期記起來！\n\n活動說明 → kdan.cc/1111',
    ig: '雙十一來了｜PDF Reader 全方案 5 折\n\n11/11 00:00 開跑，只有 72 小時。年訂閱、團隊方案都折，結帳自動套用。\n\n史上最低價，先收藏這篇！',
    line: '【雙十一預告】PDF Reader 全方案 5 折\n11/11 00:00 開跑，限時 72 小時\n活動說明 → kdan.cc/1111',
  },
  us: {
    shared: '11.11 Global Sale: 50% off every PDF Reader plan\n\nStarts Nov 11 at 12:00 AM ET and runs for 72 hours. Annual and team plans included, and the discount applies at checkout.\n\nMark your calendar.',
    fb: '11.11 Global Sale: 50% off every PDF Reader plan\n\nStarts Nov 11 at 12:00 AM ET and runs for 72 hours. Annual and team plans included, and the discount applies at checkout.\n\nDetails: kdan.cc/1111-us',
    ig: '50% off every PDF Reader plan, for 72 hours only.\n\nThe 11.11 Global Sale starts Nov 11 at 12:00 AM ET. Annual and team plans included.\n\nSave this post so you don’t miss it.',
  },
  jp: {
    shared: '【11.11 セール予告】PDF Reader 全プラン 50% OFF\n\n11月11日 0:00 スタート、72時間限定です。年間プラン・チームプランも対象で、お支払い時に自動で適用されます。\n\nぜひカレンダーに登録してください。',
    fb: '【11.11 セール予告】PDF Reader 全プラン 50% OFF\n\n11月11日 0:00 スタート、72時間限定です。年間プラン・チームプランも対象で、お支払い時に自動で適用されます。\n\n詳細はこちら：kdan.cc/1111-jp',
    ig: 'PDF Reader 全プランが 50% OFF になります。\n\n11.11 セールは 11月11日 0:00 から72時間限定。年間プラン・チームプランも対象です。\n\n忘れないように保存しておいてください。',
    line: '【11.11 セール予告】\nPDF Reader 全プラン 50% OFF\n11/11 0:00〜72時間限定\n詳細：kdan.cc/1111-jp',
  },
};

const FIRST_COMMENT = { tw: '#KdanMobile #PDFReader #雙十一 #辦公效率', us: '#PDFReader #productivity #1111sale', jp: '#PDFReader #業務効率化 #1111セール' };

const SUGGEST = {
  tw: {
    rephrase: '一年一次的雙十一｜PDF Reader 全方案 5 折\n\n11/11 00:00 準時開跑，只有 72 小時。年訂閱、團隊方案通通有折，結帳時自動幫你套用。',
    shorten: 'PDF Reader 全方案 5 折｜11/11 00:00 起限時 72 小時，結帳自動套用。',
    casual: '雙十一要來了！PDF Reader 全部方案直接 5 折，11/11 半夜 12 點開始，只有 3 天，記得設鬧鐘。',
    formal: 'PDF Reader 雙十一優惠：自 11 月 11 日 00:00 起 72 小時內，全方案享 5 折優惠，適用年訂閱與團隊方案，結帳時自動折抵。',
  },
  us: {
    rephrase: 'Our biggest sale of the year: 50% off every PDF Reader plan.\n\nIt starts Nov 11 at 12:00 AM ET and lasts 72 hours. Annual and team plans included.',
    shorten: '50% off every PDF Reader plan. Nov 11, 12:00 AM ET, 72 hours only.',
    casual: 'Heads up: every PDF Reader plan is 50% off for 72 hours, starting Nov 11. Set a reminder.',
    formal: 'PDF Reader will offer 50% off all plans for 72 hours beginning November 11 at 12:00 AM ET. The discount applies automatically at checkout.',
  },
  jp: {
    rephrase: '年に一度の 11.11 セール。PDF Reader 全プランが 50% OFF です。\n\n11月11日 0:00 から72時間限定。年間プラン・チームプランも対象です。',
    shorten: 'PDF Reader 全プラン 50% OFF。11月11日 0:00 から72時間限定です。',
    casual: 'PDF Reader 全プランが半額に！11/11 0:00 から3日間だけです。',
    formal: 'PDF Reader では 11月11日 0:00 より72時間、全プランを 50% OFF にてご提供いたします。お支払い時に自動で適用されます。',
  },
};
const TAGS = {
  tw: '#PDFReader（常用，互動中上）\n#雙十一（活動期間搜尋量高）\n#辦公效率（近期互動成長最快）\n#KdanMobile（品牌標籤）',
  us: '#PDFReader\n#productivity\n#1111sale\n#worksmarter',
  jp: '#PDFReader\n#業務効率化\n#1111セール\n#ペーパーレス',
};
const ACTION_LABEL = { rephrase: '改寫', shorten: '縮短', casual: '更口語', formal: '更正式', tags: '建議標籤', ask: '依你的指示修改' };

export default function Compose() {
  const { igTwExpired, reconnect, decide, toast } = useStore();
  const [texts, setTexts] = useState(INITIAL_TEXT);
  const [market, setMarket] = useState('tw');
  const [pfTab, setPfTab] = useState('shared');
  const [right, setRight] = useState('ai');
  const [on, setOn] = useState(Object.fromEntries(ACCOUNTS.map((a) => [a.id, true])));
  const [confirmed, setConfirmed] = useState({ us: false, jp: false });
  const [fixed, setFixed] = useState(false);
  const [lineFix, setLineFix] = useState(false);
  const [tzOk, setTzOk] = useState(false);
  const [mode, setMode] = useState('local');
  const [best, setBest] = useState(false);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  const accountsIn = (m) => ACCOUNTS.filter((a) => a.market === m);
  const pfs = accountsIn(market).filter((a) => on[a.id]).map((a) => a.pf);
  const pf = pfTab === 'shared' || pfs.includes(pfTab) ? pfTab : 'shared';
  const key = texts[market][pf] !== undefined ? pf : 'shared';
  const caption = texts[market][key];
  const lang = MARKETS[market].lang;
  const setCaption = (v) => setTexts((t) => ({ ...t, [market]: { ...t[market], [key]: v } }));

  const runAction = (k) => {
    setRight('ai');
    setAction(k);
    setBusy(true);
    setTimeout(() => setBusy(false), 700);
  };
  const suggestion = action === 'tags' ? TAGS[market]
    : action === 'ask' ? (market === 'jp' ? caption.replace('対象で、', '対象（学生プランを含む）で、') : `${caption}\n\n${market === 'us' ? 'Student plans are included too.' : '學生方案也適用。'}`)
    : action ? SUGGEST[market][action] : null;

  const applyFix = () => {
    setFixed(true);
    setTexts((t) => ({ ...t, tw: Object.fromEntries(Object.entries(t.tw).map(([k, v]) => [k, v.replaceAll('史上最低價', '年度最優惠')])) }));
  };

  const pickedN = Object.values(on).filter(Boolean).length;
  const pickedMarkets = MARKET_KEYS.filter((m) => accountsIn(m).some((a) => on[a.id]));
  const hasBanned = Object.values(texts.tw).some((v) => v.includes('史上最低價'));
  const unconfirmed = pickedMarkets.filter((m) => m !== 'tw' && !confirmed[m]);

  const checks = [
    hasBanned
      ? { tone: 'err', ai: true, title: '台灣：「史上最低價」可能有法規風險', detail: '比較性的最高級用語需要能舉證，建議改成「年度最優惠」。FB、IG 版本會一起改。', action: '套用建議', act: applyFix }
      : { tone: 'ok', ai: true, title: '台灣：用語沒有問題', detail: fixed ? '「史上最低價」已改成「年度最優惠」。' : '沒有發現禁用詞或誇大用語。' },
    tzOk
      ? { tone: 'ok', ai: true, title: '跨市場：結束時間已確認', detail: '三個市場各自在當地 11/13 23:59 結束。' }
      : { tone: 'warn', ai: true, title: '跨市場：結束時間不一樣', detail: '三個版本都寫「72 小時」，但各自從當地 0:00 起算，美國會比台灣晚 12 小時結束。是刻意的嗎？', action: '是刻意的', act: () => setTzOk(true) },
    on.tw_ig && igTwExpired
      ? { tone: 'err', title: '台灣 Instagram：授權已失效', detail: '內容沒問題，但要先重新連結帳號才能排程。', action: '重新連結', act: () => reconnect('tw_ig') }
      : null,
    on.tw_line && (lineFix
      ? { tone: 'ok', ai: true, title: '台灣 LINE：額度足夠', detail: '改成圖文卡片，只發給近 90 天有互動的好友（約 1,800 人），預估扣 1,800 則，本月剩 2,060 則。' }
      : { tone: 'err', ai: true, title: '台灣 LINE：本月訊息額度不夠', detail: '群發 5,430 人 × 2 則（文字＋圖片）＝ 10,860 則，本月只剩 2,060 則。建議改成一張圖文卡片，並只發給近 90 天有互動的好友。', action: '套用建議', act: () => setLineFix(true) }),
    unconfirmed.length
      ? { tone: 'warn', title: `${unconfirmed.map((m) => MARKETS[m].name).join('、')}版本還沒確認`, detail: 'AI 在地化的版本要先有人看過、按「確認這個版本」才能送審。', action: '去確認', act: () => { setMarket(unconfirmed[0]); setPfTab('shared'); } }
      : null,
    { tone: 'ok', title: '其他帳號：可以發布', detail: '日本 LINE 預估扣 18,900 則，本月剩 41,000 則；IG 每篇都有圖片，替代文字已產生。' },
  ].filter(Boolean);
  const blocking = checks.filter((c) => c.tone === 'err' || (c.tone === 'warn' && c.title.includes('確認'))).length;

  const submit = () => {
    pickedMarkets.filter((m) => m !== 'tw').forEach((m) => decide('p1', m, 'wait'));
    toast(`已送出審核：${pickedMarkets.map((m) => MARKETS[m].name).join('、')}`);
    navigate('/approvals');
  };

  const pvPf = pf === 'shared' ? (pfs[0] || 'fb') : pf;
  const pvAcc = accountsIn(market).find((a) => a.pf === pvPf);
  const pvTime = mode === 'local' ? (market === 'jp' && best ? '21:00' : '20:00') : { tw: '20:00', us: '08:00', jp: '21:00' }[market];
  const pvText = pf === pvPf ? caption : (texts[market][pvPf] ?? texts[market].shared);
  const counter = pf === 'ig' ? `${caption.length} / 2,200 字` : pf === 'line' ? `${caption.length} / 5,000 字` : `${caption.length} 字`;

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
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>發到哪些帳號</span>
              <span className="small muted">已選 {pickedN} 個帳號</span>
            </div>
            {MARKET_KEYS.map((m) => (
              <div key={m} className="row">
                <span className="small" style={{ width: 64, color: 'var(--ink-2)' }}><strong style={{ fontSize: 11, color: 'var(--ink)', marginRight: 6 }}>{MARKETS[m].code}</strong>{MARKETS[m].name}</span>
                {accountsIn(m).map((a) => {
                  const bad = a.id === 'tw_ig' && igTwExpired;
                  const sel = on[a.id];
                  return (
                    <label key={a.id} className="row" style={{ gap: 8, minHeight: 40, padding: '0 12px 0 8px', borderRadius: 8, cursor: 'pointer', flexWrap: 'nowrap', border: `1px solid ${sel ? (bad ? '#E9A39C' : 'var(--accent)') : 'var(--line)'}`, background: sel ? (bad ? '#FFFAF9' : '#F7F9FF') : '#fff' }}>
                      <input type="checkbox" checked={sel} onChange={() => setOn((o) => ({ ...o, [a.id]: !o[a.id] }))} style={{ accentColor: 'var(--accent)', margin: 0 }} />
                      <Pf pf={a.pf} />
                      <span className="small">{a.name}</span>
                      {bad && <span className="tiny" style={{ color: 'var(--err)' }}>授權失效</span>}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="tabs" role="tablist" aria-label="市場版本" style={{ paddingTop: 8 }}>
              {MARKET_KEYS.map((m) => {
                const badge = m === 'tw' ? ['neutral', '原稿'] : confirmed[m] ? ['ok', '已確認'] : ['plan', 'AI 在地化 · 待確認'];
                return (
                  <button key={m} type="button" role="tab" aria-selected={m === market} onClick={() => setMarket(m)}>
                    <strong style={{ fontSize: 11 }}>{MARKETS[m].code}</strong>{MARKETS[m].name}
                    <span className={`chip chip-${badge[0]}`} style={{ height: 20, fontSize: 11 }}>{badge[1]}</span>
                  </button>
                );
              })}
            </div>

            {market !== 'tw' && !confirmed[market] && (
              <div className="row" style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 10, background: 'var(--accent-wash)', border: '1px solid var(--accent-line)', gap: '10px 12px' }}>
                <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="spark" /></span>
                <div className="small" style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>AI 依台灣原稿在地化，不是逐字翻譯</div>
                  <div style={{ color: 'var(--ink-2)' }}>
                    {market === 'us'
                      ? '套用「美國市場」語氣（直接、句首大寫），活動時間改成美東時間，連結換成美國活動頁；產品名照詞彙表不翻譯。'
                      : '套用「日本市場」語氣（です・ます、少用驚嘆號），活動時間改成日本時間，連結換成日本活動頁；產品名照詞彙表不翻譯。'}
                  </div>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => toast('原稿：' + texts.tw.shared.split('\n')[0])}>對照原稿</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setConfirmed((c) => ({ ...c, [market]: true }))}>確認這個版本</button>
              </div>
            )}

            <div className="row" role="tablist" aria-label="平台版本" style={{ padding: '12px 16px 0', gap: 6 }}>
              {['shared', ...pfs].map((p) => (
                <button key={p} type="button" role="tab" className="pill" aria-selected={p === pf} onClick={() => setPfTab(p)}>{p === 'shared' ? '共用內容' : PF[p].name}</button>
              ))}
              <span className="tiny muted" style={{ marginLeft: 4 }}>{pf === 'shared' ? '共用內容會帶到這個市場的所有平台' : `AI 已依 ${PF[pf].name} 的格式改寫，可以直接編輯`}</span>
            </div>

            <label htmlFor="caption" className="sr-only">貼文內容</label>
            <textarea id="caption" lang={lang} rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} style={{ margin: '12px 16px 0', padding: 0, border: 0, resize: 'vertical', fontSize: 15, lineHeight: 1.65, outline: 'none' }} />

            <div className="row" style={{ padding: '12px 16px', gap: 10, alignItems: 'flex-end' }}>
              <div role="img" aria-label="圖片 1" style={{ width: 80, height: 80, borderRadius: 8, background: '#DCE3F5' }} />
              <div role="img" aria-label="圖片 2" style={{ width: 80, height: 80, borderRadius: 8, background: '#E8E1F2' }} />
              <button type="button" onClick={() => toast('原型：上傳媒體尚未實作')} style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed #B8BEC7', background: '#FAFBFC', fontSize: 12, color: 'var(--ink-2)' }}>加入媒體</button>
              <span className="tiny" style={{ color: 'var(--ink-2)' }}>替代文字：AI 已產生 2 張</span>
            </div>

            {pf === 'ig' && (
              <div className="row" style={{ padding: '0 16px 12px' }}>
                <label htmlFor="fc" className="small" style={{ width: 72, color: 'var(--ink-2)' }}>第一則留言</label>
                <input id="fc" className="input" defaultValue={FIRST_COMMENT[market]} key={market} style={{ flex: '1 1 300px', minHeight: 36, fontSize: 13 }} />
              </div>
            )}
            {pf === 'line' && (
              <div className="row small" style={{ padding: '0 16px 12px' }}>
                <span style={{ width: 72, color: 'var(--ink-2)' }}>發送對象</span>
                <span className="chip chip-plan" style={{ height: 30 }}>{market === 'tw' ? (lineFix ? '近 90 天有互動（約 1,800 人）' : '全部好友（5,430 人）') : '全部好友（18,900 人）'}</span>
                <span style={{ color: 'var(--ink-2)', marginLeft: 8 }}>格式</span>
                <span className="chip chip-neutral" style={{ height: 30 }}>{market === 'tw' && lineFix ? '圖文卡片（1 則）' : '文字＋圖片（2 則）'}</span>
              </div>
            )}

            <div className="row" style={{ padding: '10px 16px', borderTop: '1px solid var(--line-soft)', gap: 6 }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="spark" size={16} /></span>
              {['rephrase', 'shorten', 'casual', 'formal', 'tags'].map((k) => (
                <button key={k} type="button" className="btn btn-sm" onClick={() => runAction(k)}>{ACTION_LABEL[k]}</button>
              ))}
              <span className="spacer small muted num">{counter}</span>
            </div>
          </div>

          <div className="card card-pad stack">
            <div className="row">
              <h3>發布前檢查</h3>
              <span className="tiny muted">平台規則＋AI 檢查，涵蓋所有市場版本</span>
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
                <span className="chip" style={{ background: '#fff', border: '1px solid var(--control)', height: 30 }}>KDAN Mobile ＋ {MARKETS[market].name}市場</span>
                <Link to="/voice">編輯</Link>
              </div>

              <div className="card card-pad stack" style={{ border: 0, gap: 10 }}>
                <div style={{ fontWeight: 600 }}>一次產生所有版本</div>
                <div className="small" style={{ color: 'var(--ink-2)' }}>以台灣原稿為準，改寫成各平台版本，再在地化到美國、日本。手動改過或已確認的版本不會被覆蓋。</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                  {ACCOUNTS.filter((a) => on[a.id]).map((a) => {
                    const done = a.market === 'tw' || confirmed[a.market];
                    return (
                      <span key={a.id} className="row tiny" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <CheckMark tone={done ? 'ok' : 'info'} />
                        {MARKETS[a.market].code} {PF[a.pf].name}{done ? '' : '（待確認）'}
                      </span>
                    );
                  })}
                </div>
                <button type="button" className="btn btn-soft" disabled={regenerating} onClick={() => { setRegenerating(true); setTimeout(() => { setRegenerating(false); toast('已重新產生未確認的版本'); }, 900); }}>
                  {regenerating ? '產生中…' : '重新產生未確認的版本'}
                </button>
              </div>

              <div className="card card-pad stack" style={{ border: 0, gap: 10 }}>
                {!action && (
                  <>
                    <div style={{ fontWeight: 600 }}>快速調整</div>
                    <div className="small" style={{ color: 'var(--ink-2)' }}>點編輯區下方的「改寫」「縮短」等按鈕，或在下面直接告訴 AI 想怎麼改。結果會先放在這裡，你決定要不要套用。</div>
                  </>
                )}
                {action && (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{ACTION_LABEL[action]}</span>
                      <span className="tiny muted">{MARKETS[market].name} · {pf === 'shared' ? '共用內容' : PF[pf].name}</span>
                    </div>
                    <div lang={lang} className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line', minHeight: 60, color: busy ? 'var(--ink-3)' : 'var(--ink)' }}>
                      {busy ? '產生中…' : suggestion}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {action === 'tags'
                        ? <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => { toast('標籤已放進第一則留言'); setAction(null); }}>放進第一則留言</button>
                        : <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => { setCaption(suggestion); setAction(null); toast('已取代內容'); }}>取代內容</button>}
                      {action !== 'tags' && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setCaption(`${caption}\n\n${suggestion}`); setAction(null); }}>插在後面</button>}
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => runAction(action)}>再試一次</button>
                    </div>
                  </>
                )}
              </div>

              <form className="card card-pad stack" style={{ border: 0, gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (ask.trim()) { runAction('ask'); setAsk(''); } }}>
                <label htmlFor="ask" style={{ fontWeight: 600 }} className="small">想怎麼改？</label>
                <textarea id="ask" className="textarea small" rows={2} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="例：加一句「學生方案也適用」，語氣再客氣一點" />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="tiny muted">只改目前的版本：{MARKETS[market].name} · {pf === 'shared' ? '共用內容' : PF[pf].name}</span>
                  <button type="submit" className="btn btn-sm btn-dark">送出</button>
                </div>
              </form>
              <div className="tiny" style={{ color: 'var(--ink-2)' }}>AI 產生的內容可能有誤，送審前請確認。AI 不會自行發布或排程。</div>
            </div>
          )}

          {right === 'preview' && (
            <div className="stack">
              <div className="small" style={{ color: 'var(--ink-2)' }}>{MARKETS[market].name} · {PF[pvPf].name} 的樣子</div>
              {pvPf === 'line' ? (
                <div style={{ background: '#8CABD9', borderRadius: 10, padding: '16px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="brand-mark" style={{ borderRadius: 16, width: 32, height: 32 }} aria-hidden="true">K</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '82%' }}>
                    <div lang={lang} className="small" style={{ background: '#fff', borderRadius: 14, padding: '10px 12px', whiteSpace: 'pre-line' }}>{pvText}</div>
                    <div aria-hidden="true" style={{ width: 180, aspectRatio: '1', borderRadius: 14, background: '#DCE3F5' }} />
                  </div>
                </div>
              ) : (
                <div className="card" style={{ border: 0, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,24,30,.08)' }}>
                  <div className="row" style={{ padding: '12px 14px', gap: 10 }}>
                    <span className="brand-mark" style={{ borderRadius: 17, width: 34, height: 34 }} aria-hidden="true">K</span>
                    <div><div style={{ fontWeight: 600 }}>{pvAcc?.name}</div><div className="tiny muted">10/20 {pvTime} {MARKETS[market].zone}</div></div>
                  </div>
                  <div lang={lang} style={{ padding: '0 14px 12px', whiteSpace: 'pre-line' }}>{pvText}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <div aria-hidden="true" style={{ aspectRatio: '1', background: '#DCE3F5' }} />
                    <div aria-hidden="true" style={{ aspectRatio: '1', background: '#E8E1F2' }} />
                  </div>
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                {pfs.map((p) => <button key={p} type="button" className="pill" aria-selected={p === pvPf} onClick={() => setPfTab(p)}>{PF[p].name}</button>)}
              </div>
            </div>
          )}
        </aside>
      </div>

      <footer className="row compose-footer" style={{ padding: '12px 24px', background: 'var(--surface)', borderTop: '1px solid var(--line)', gap: '10px 14px', position: 'sticky', bottom: 0 }}>
        <Seg role="radio" label="發布時間的基準" value={mode} onChange={setMode} options={[['local', '各市場當地時間'], ['same', '同一時刻']]} />
        <span className="small num">
          {mode === 'local' ? `10/20 · TW 20:00 · US 20:00 EDT · JP ${best ? '21:00' : '20:00'} JST` : '台北 10/20 20:00 ＝ US 08:00 EDT · JP 21:00 JST'}
        </span>
        <button type="button" className="chip" onClick={() => { setBest(true); setMode('local'); }} style={{ border: '1px dashed #A9B7E6', background: 'var(--accent-wash)', color: 'var(--accent)', height: 32 }}>
          {best ? '已套用：日本改 21:00' : 'AI 建議：日本改 21:00（近 30 天互動最高）'}
        </button>
        <div className="row spacer">
          <span className="tiny" style={{ color: blocking ? 'var(--err)' : 'var(--ink-3)' }}>{blocking ? `還有 ${blocking} 項要處理才能送審` : '各市場由當地負責人核准'}</span>
          <button type="button" className="btn" onClick={() => toast('草稿已儲存')}>儲存草稿</button>
          <button type="button" className="btn btn-primary" disabled={blocking > 0} onClick={submit}>送出審核（{pickedMarkets.length} 個市場）</button>
        </div>
      </footer>
    </div>
  );
}
