import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Pf, Seg, AiHeader } from '../components/ui.jsx';

// Group-level rules are optional; these fill KDAN's three sample groups.
const RULES = {
  g1: '用台灣用語：影片、軟體、檔案、登入（不用視頻、軟件、文件、登錄）\n中英文之間加空格\n價格寫「NT$」，折扣寫「5 折」\n一篇最多 1 個驚嘆號',
  g2: 'Sentence case for headlines\nLead with the benefit, then the detail\nAvoid exclamation marks; never more than one per post\nPrices in US$, discounts as "50% off"',
  g3: 'です・ます調で統一\n感嘆符は 1 投稿 1 つまで\n価格は税込表記、割引は「50% OFF」\n「雙十一」は日本では認知度が低いので「年末セール」と併記',
};
const EXAMPLES = {
  g1: ['新功能｜AI 摘要支援 30 頁以上長文件\n合約、報告丟進去，30 秒抓出重點。', '用戶故事｜一位會計師如何用 PDF 表單，每週省下 3 小時。'],
  g2: ['New: AI summaries now handle documents over 30 pages.\nDrop in a contract or report and get the key points in seconds.', 'How one accountant saves 3 hours a week with PDF forms.'],
  g3: ['新機能：AI 要約が 30 ページ以上の文書に対応しました。\n契約書やレポートの要点を、すばやく確認できます。', '会計士の方が PDF フォームで毎週 3 時間を短縮した事例をご紹介します。'],
};
const LEARNED = {
  brand: ['開頭用「｜」分隔主題和重點的貼文，互動率比平均高 24%。', '提到具體省下的時間（「每週 3 小時」）比只說「更有效率」互動高。', '連結放最後一行；放中間的貼文點擊率較低。'],
  g1: ['這個群組的貼文平均 68 字，超過 120 字的互動明顯下降。', '晚上 20:00 發的貼文互動最好。'],
  g2: ['Posts that open with a number get 31% more saves on Instagram.', 'Shorter Facebook posts (under 200 characters) get more clicks.'],
  g3: ['丁寧な締めの一文（「ぜひご活用ください」）がある投稿の方が反応が良い。', 'LINE は 4 行以内の配信の方がクリック率が高い。'],
};
const GLOSSARY = [
  ['PDF Reader', 'PDF Reader', 'PDF Reader', '產品名，不翻譯'],
  ['Document 365', 'Document 365', 'Document 365', '產品名，不翻譯'],
  ['電子簽名', 'eSign', '電子署名', '功能名'],
  ['5 折', '50% off', '50% OFF', '折扣寫法'],
  ['雙十一', '11.11 Sale', '年末セール（11.11）', '活動名'],
];

function samplesFor(topic, emoji, formal) {
  const bang = emoji === 'many' ? ' 🎉' : '';
  const t = topic || '雙十一全方案 5 折預告';
  return {
    g1: formal > 70
      ? `${t}｜PDF Reader 自 11/11 00:00 起 72 小時內，全方案享 5 折優惠。${bang}`
      : `${t}｜PDF Reader 全方案 5 折\n11/11 00:00 開跑，限時 72 小時，結帳自動套用。${bang}`,
    g2: `50% off every PDF Reader plan.\nThe 11.11 sale starts Nov 11 at 12:00 AM ET and runs for 72 hours.${bang}`,
    g3: `【年末セール】PDF Reader 全プラン 50% OFF\n11月11日 0:00 から72時間限定です。${bang}`,
  };
}

export default function BrandVoice() {
  const { toast, groups, accounts } = useStore();
  const [picked, setTab] = useState('brand');
  const [emoji, setEmoji] = useState('few');
  const [formal, setFormal] = useState(40);
  const [emotion, setEmotion] = useState(30);
  const [banned, setBanned] = useState(['史上最', '保證', '100%', '免費（沒附條件時）', '第一品牌']);
  const [newWord, setNewWord] = useState('');
  const [topic, setTopic] = useState('雙十一全方案 5 折預告');
  const [samples, setSamples] = useState(() => samplesFor('雙十一全方案 5 折預告', 'few', 40));
  const [gen, setGen] = useState(false);

  // A deleted group falls back to the brand tab.
  const group = groups.find((g) => g.id === picked);
  const tab = group ? picked : 'brand';
  const shownSamples = Object.entries(samples).filter(([k]) => groups.some((g) => g.id === k) && (tab === 'brand' || k === tab));
  const nameOf = (id) => groups.find((g) => g.id === id)?.name;
  const regenerate = () => {
    setGen(true);
    setTimeout(() => { setSamples(samplesFor(topic, emoji, 100 - formal)); setGen(false); }, 700);
  };

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>品牌語氣</h1>
          <div className="sub">AI 寫文案、改寫、在地化時都照這裡。品牌設定套用到所有帳號；群組可以再疊加自己的規則（選填）。</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => toast('已儲存，之後 AI 產生的內容會套用新設定')}>儲存</button>
      </header>

      <div className="tabs" role="tablist" aria-label="設定層級" style={{ padding: 0 }}>
        {[['brand', '品牌（所有帳號）'], ...groups.map((g) => [g.id, g.name])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'brand' ? (
            <>
              <section className="card card-pad stack" style={{ gap: 16 }}>
                <div className="field">
                  <label htmlFor="about">品牌介紹</label>
                  <textarea id="about" className="textarea" rows={3} defaultValue="KDAN Mobile 做 PDF 與文件工具（PDF Reader、Document 365），使用者以上班族、會計、法務與小型團隊為主。說話像可靠的同事：講清楚能省多少時間，不誇大。" />
                </div>
                {[['r1', '正式程度', '正式', '口語', formal, setFormal], ['r2', '說服方式', '講數據', '講感受', emotion, setEmotion]].map(([id, label, l, r, v, set]) => (
                  <div key={id} className="field" style={{ gap: 4 }}>
                    <label htmlFor={id}>{label}</label>
                    <input id={id} type="range" min="0" max="100" value={v} onChange={(e) => set(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
                    <div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>{l}</span><span>{r}</span></div>
                  </div>
                ))}
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ fontWeight: 600, width: 96 }}>表情符號</span>
                  <Seg role="radio" label="表情符號" value={emoji} onChange={setEmoji} options={[['none', '不用'], ['few', '少量'], ['many', '常用']]} />
                </div>
                <div className="field">
                  <span className="label">禁用詞</span>
                  <div className="row" style={{ gap: 6 }}>
                    {banned.map((b) => (
                      <button key={b} type="button" className="chip chip-err" style={{ border: 0, height: 28, borderRadius: 14, padding: '0 10px', fontSize: 13 }} aria-label={`移除禁用詞 ${b}`} onClick={() => setBanned((x) => x.filter((y) => y !== b))}>{b} ×</button>
                    ))}
                    <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (newWord.trim()) { setBanned((x) => [...x, newWord.trim()]); setNewWord(''); } }}>
                      <label htmlFor="nw" className="sr-only">新增禁用詞</label>
                      <input id="nw" className="input" value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="新增禁用詞" style={{ minHeight: 30, width: 120, fontSize: 13 }} />
                    </form>
                  </div>
                  <span className="tiny muted">AI 不會寫出這些詞；你自己寫到的話，發布前檢查會提醒。</span>
                </div>
              </section>

              <section className="card">
                <div className="card-head"><h2>詞彙表</h2><span className="tiny muted">在地化時固定照這張表</span></div>
                <div className="table-wrap">
                  <table style={{ minWidth: 620 }}>
                    <thead><tr><th>中文</th><th>English</th><th>日本語</th><th>規則</th></tr></thead>
                    <tbody>{GLOSSARY.map(([a, b, c, d]) => <tr key={a}><td>{a}</td><td>{b}</td><td lang="ja-JP">{c}</td><td style={{ color: 'var(--ink-2)' }}>{d}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="card card-pad stack" style={{ gap: 14 }}>
              <div className="row small" style={{ gap: 8, color: 'var(--ink-2)' }}>
                <span>套用到</span>
                {accounts.filter((a) => a.group === tab).map((a) => <span key={a.id} className="row tiny" style={{ gap: 4 }}><Pf pf={a.pf} size="sm" />{a.name}</span>)}
              </div>
              <div className="field">
                <label htmlFor="rules">「{group?.name}」的額外規則（選填）</label>
                <textarea id="rules" key={tab} className="textarea" rows={5} defaultValue={RULES[tab] ?? ''} placeholder="例如這組帳號用的語言、稱呼、價格寫法" />
                <span className="tiny muted">和品牌設定衝突時，以這裡為準。</span>
              </div>
              <div className="field">
                <span className="label">範例貼文</span>
                {(EXAMPLES[tab] ?? []).length === 0 && <div className="small muted">還沒有範例；可以貼幾篇這組帳號寫得好的貼文。</div>}
                {(EXAMPLES[tab] ?? []).map((x) => <div key={x} className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line' }}>{x}</div>)}
                <span className="tiny muted">AI 會模仿這些範例的長度與節奏。</span>
              </div>
            </section>
          )}

          <section className="card card-ai card-pad stack" style={{ gap: 10 }}>
            <AiHeader title="從過去的貼文學" note={tab === 'brand' ? '分析所有帳號最近 150 篇貼文' : '分析這個群組最近 50 篇貼文'} />
            <ul className="small stack" style={{ gap: 4 }}>{(LEARNED[tab] ?? ['資料還不夠，這個群組累積 20 篇貼文後會開始分析。']).map((l) => <li key={l}>{l}</li>)}</ul>
            <div className="row">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => toast('已加進規則')}>加進規則</button>
              <button type="button" className="btn btn-sm" onClick={() => toast('重新分析中，完成後會通知你')}>重新分析</button>
            </div>
          </section>
        </div>

        <aside className="card card-pad stack" aria-label="試寫" style={{ flex: '1 1 340px', minWidth: 0 }}>
          <h2>試寫看看</h2>
          <div className="field">
            <label htmlFor="topic" className="small" style={{ fontWeight: 500, color: 'var(--ink-2)' }}>主題</label>
            <input id="topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <button type="button" className="btn btn-soft" disabled={gen} onClick={regenerate}>{gen ? '產生中…' : '用目前設定產生'}</button>
          {shownSamples.map(([k, text]) => (
            <div key={k} className="stack" style={{ gap: 4 }}>
              <span className="tiny" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{nameOf(k)}</span>
              <div className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line', opacity: gen ? 0.5 : 1 }}>{text}</div>
            </div>
          ))}
          <span className="tiny muted">改完設定可以馬上試，滿意再儲存。</span>
        </aside>
      </div>
    </main>
  );
}
