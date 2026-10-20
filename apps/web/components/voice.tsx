'use client';

import { useState, useTransition } from 'react';
import type { GroupVoice, Voice } from '@kdan-social/core';
import { Icon, Pf, type Platform } from './ui';
import type { SampleResult } from '@/app/app/actions';

type Group = { id: string; name: string; accounts: Array<{ id: string; name: string; platform: Platform }> };

/**
 * The brand voice editor: settings on the left, a live "try it" on the right that uses
 * the unsaved settings, as Customer.io's Tone & Voice previews before saving.
 */
export function VoiceEditor({ initial, initialGroups, groups, editable, aiReady, save, sample }: {
  initial: Voice; initialGroups: Record<string, GroupVoice>; groups: Group[]; editable: boolean; aiReady: boolean;
  save: (f: FormData) => void; sample: (input: { topic: string; voice: Voice; groups: Array<{ id: string; name: string; voice: GroupVoice }> }) => Promise<SampleResult>;
}) {
  const [tab, setTab] = useState<string>('brand');
  const [voice, setVoice] = useState<Voice>(initial);
  const [gv, setGv] = useState<Record<string, GroupVoice>>(initialGroups);
  const [newWord, setNewWord] = useState('');
  const [newExample, setNewExample] = useState('');
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<SampleResult | null>(null);
  const [pending, start] = useTransition();
  const group = groups.find((g) => g.id === tab);
  const groupVoice = (id: string) => gv[id] ?? { rules: '', examples: [] };
  const setGroup = (id: string, patch: Partial<GroupVoice>) => setGv((all) => ({ ...all, [id]: { ...groupVoice(id), ...patch } }));
  const payload = JSON.stringify({ voice, groups: gv });
  const disabled = !editable;

  const runSample = () => start(async () => {
    setResult(await sample({ topic, voice, groups: groups.map((g) => ({ id: g.id, name: g.name, voice: groupVoice(g.id) })) }));
  });

  return (
    <form action={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="payload" value={payload} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="tabs" role="tablist" aria-label="設定層級" style={{ padding: 0, flex: 1 }}>
          {[['brand', '品牌（所有帳號）'] as const, ...groups.map((g) => [g.id, g.name] as const)].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {editable && <button type="submit" className="btn btn-primary">儲存</button>}
      </div>
      {!editable && <div className="small muted">只有擁有者或管理員可以修改；你可以試寫看看。</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!group ? (
            <>
              <section className="card card-pad stack" style={{ gap: 16 }}>
                <div className="field">
                  <label htmlFor="about">品牌介紹</label>
                  <textarea id="about" className="textarea" rows={3} maxLength={2000} disabled={disabled} value={voice.about} onChange={(e) => setVoice({ ...voice, about: e.target.value })} placeholder="做什麼產品、主要對象是誰、說話像怎樣的人" />
                </div>
                {([['formality', '正式程度', '正式', '口語'], ['persuasion', '說服方式', '講數據', '講感受']] as const).map(([k, label, l, r]) => (
                  <div key={k} className="field" style={{ gap: 4 }}>
                    <label htmlFor={k}>{label}</label>
                    <input id={k} type="range" min="0" max="100" disabled={disabled} value={voice[k]} onChange={(e) => setVoice({ ...voice, [k]: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
                    <div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>{l}</span><span>{r}</span></div>
                  </div>
                ))}
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ fontWeight: 600, width: 96 }}>表情符號</span>
                  <div className="seg" role="radiogroup" aria-label="表情符號">
                    {([['none', '不用'], ['few', '少量'], ['many', '常用']] as const).map(([k, l]) => (
                      <button key={k} type="button" role="radio" aria-checked={voice.emoji === k} disabled={disabled} onClick={() => setVoice({ ...voice, emoji: k })}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">禁用詞</span>
                  <div className="row" style={{ gap: 6 }}>
                    {voice.banned.map((b) => (
                      <button key={b} type="button" className="chip chip-err" disabled={disabled} style={{ border: 0, height: 28, borderRadius: 14, padding: '0 10px', fontSize: 13 }} aria-label={`移除禁用詞 ${b}`} onClick={() => setVoice({ ...voice, banned: voice.banned.filter((x) => x !== b) })}>{b}{editable ? ' ×' : ''}</button>
                    ))}
                    {editable && (
                      <input aria-label="新增禁用詞" className="input" value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="新增禁用詞，按 Enter" style={{ minHeight: 30, width: 170, fontSize: 13 }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const w = newWord.trim(); if (w && !voice.banned.includes(w)) setVoice({ ...voice, banned: [...voice.banned, w] }); setNewWord(''); } }} />
                    )}
                  </div>
                  <span className="tiny muted">AI 不會寫出這些詞；你自己寫到的話，發布前檢查會提醒。括號裡可以寫例外，例如「免費（沒附條件時）」。</span>
                </div>
              </section>

              <section className="card">
                <div className="card-head"><h2>詞彙表</h2><span className="tiny muted">產品名、活動名等固定寫法；AI 改寫和在地化時一定照這張表</span></div>
                <div className="table-wrap">
                  <table style={{ minWidth: 520 }}>
                    <thead><tr><th style={{ width: '35%' }}>詞彙</th><th>寫法</th>{editable && <th style={{ width: 48 }} />}</tr></thead>
                    <tbody>
                      {voice.glossary.map((g, i) => (
                        <tr key={i}>
                          <td><input aria-label="詞彙" className="input" disabled={disabled} value={g.term} onChange={(e) => setVoice({ ...voice, glossary: voice.glossary.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)) })} style={{ width: '100%', minHeight: 32 }} /></td>
                          <td><input aria-label="寫法" className="input" disabled={disabled} value={g.rule} onChange={(e) => setVoice({ ...voice, glossary: voice.glossary.map((x, j) => (j === i ? { ...x, rule: e.target.value } : x)) })} placeholder="例：各語言都不翻譯；英文寫 eSign" style={{ width: '100%', minHeight: 32 }} /></td>
                          {editable && <td><button type="button" className="btn icon-btn" aria-label="刪除這條" onClick={() => setVoice({ ...voice, glossary: voice.glossary.filter((_, j) => j !== i) })} style={{ width: 32, height: 32, minHeight: 32, color: 'var(--err)' }}><Icon name="trash" size={14} /></button></td>}
                        </tr>
                      ))}
                      {voice.glossary.length === 0 && <tr><td colSpan={3} className="small muted">還沒有詞彙。</td></tr>}
                    </tbody>
                  </table>
                </div>
                {editable && <div style={{ padding: '10px 16px' }}><button type="button" className="btn btn-sm" onClick={() => setVoice({ ...voice, glossary: [...voice.glossary, { term: '', rule: '' }] })}><Icon name="plus" size={14} />新增一條</button></div>}
              </section>
            </>
          ) : (
            <section className="card card-pad stack" style={{ gap: 14 }}>
              <div className="row small" style={{ gap: 8, color: 'var(--ink-2)' }}>
                <span>套用到</span>
                {group.accounts.length === 0 && <span className="muted">（這個群組沒有帳號）</span>}
                {group.accounts.map((a) => <span key={a.id} className="row tiny" style={{ gap: 4 }}><Pf pf={a.platform} size="sm" />{a.name}</span>)}
              </div>
              <div className="field">
                <label htmlFor="rules">「{group.name}」的額外規則（選填）</label>
                <textarea id="rules" className="textarea" rows={5} maxLength={2000} disabled={disabled} value={groupVoice(group.id).rules} onChange={(e) => setGroup(group.id, { rules: e.target.value })} placeholder="例如這組帳號用的語言、稱呼、價格寫法" />
                <span className="tiny muted">和品牌設定衝突時，以這裡為準。AI 幫這組帳號改寫時，用這裡指定的語言。</span>
              </div>
              <div className="field">
                <span className="label">範例貼文</span>
                {groupVoice(group.id).examples.length === 0 && <div className="small muted">還沒有範例；可以貼幾篇這組帳號寫得好的貼文。</div>}
                {groupVoice(group.id).examples.map((x, i) => (
                  <div key={i} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 8 }}>
                    <div className="small" style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line' }}>{x}</div>
                    {editable && <button type="button" className="btn icon-btn" aria-label="刪除這篇範例" onClick={() => setGroup(group.id, { examples: groupVoice(group.id).examples.filter((_, j) => j !== i) })} style={{ width: 32, height: 32, minHeight: 32, color: 'var(--err)' }}><Icon name="trash" size={14} /></button>}
                  </div>
                ))}
                {editable && (
                  <div className="stack" style={{ gap: 6 }}>
                    <textarea aria-label="新增範例貼文" className="textarea small" rows={3} maxLength={1000} value={newExample} onChange={(e) => setNewExample(e.target.value)} placeholder="貼上一篇範例貼文" />
                    <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!newExample.trim()} onClick={() => { setGroup(group.id, { examples: [...groupVoice(group.id).examples, newExample.trim()] }); setNewExample(''); }}>加入範例</button>
                  </div>
                )}
                <span className="tiny muted">AI 會模仿這些範例的長度與節奏。</span>
              </div>
            </section>
          )}
        </div>

        <aside className="card card-pad stack" aria-label="試寫" style={{ flex: '1 1 340px', minWidth: 0 }}>
          <h2>試寫看看</h2>
          <div className="field">
            <label htmlFor="topic" className="small" style={{ fontWeight: 500, color: 'var(--ink-2)' }}>主題</label>
            <input id="topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例：雙十一全方案 5 折預告" />
          </div>
          <button type="button" className="btn btn-soft" disabled={!aiReady || pending || !topic.trim()} onClick={runSample}>{pending ? '產生中…' : '用目前設定產生'}</button>
          {!aiReady && <span className="tiny" style={{ color: 'var(--warn)' }}>這個環境還沒有設定 AI。</span>}
          {result?.error && <span className="small" role="alert" style={{ color: 'var(--err)' }}>{result.error}</span>}
          {result?.samples?.map((s) => (
            <div key={s.groupId ?? 'brand'} className="stack" style={{ gap: 4 }}>
              <span className="tiny" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{s.name}</span>
              <div className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line', opacity: pending ? 0.5 : 1 }}>{s.text}</div>
              {s.banned.length > 0 && <span className="tiny" style={{ color: 'var(--err)' }}>含禁用詞：{s.banned.join('、')}</span>}
            </div>
          ))}
          <span className="tiny muted">改完設定可以馬上試，滿意再儲存。有自訂規則的群組會各產生一篇。AI 產生的內容可能有誤。</span>
        </aside>
      </div>
    </form>
  );
}
