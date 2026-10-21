'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { PlatformMark } from '@/components/brand-icons';
import { Icon, type IconName } from '@/components/ui';
import { finishOnboardingAction, type FinishState } from './actions';

type Choice = { id: string; label: string; hint?: string; icon?: IconName; tint?: string; mark?: 'facebook' | 'instagram' | 'line' };
type Step = { key: 'describes' | 'accounts' | 'platforms' | 'goals'; title: string; multi: boolean; layout: 'cards' | 'chips' | 'tiles'; choices: Choice[] };

// Our own questions, asked one per screen with Continue and 略過, as Buffer's onboarding does.
const STEPS: Step[] = [
  { key: 'describes', title: '哪一個最像你？', multi: false, layout: 'cards', choices: [
    { id: 'brand', label: '品牌的行銷或社群人員', icon: 'users', tint: '#E9EEFD' },
    { id: 'agency', label: '行銷代理商，幫客戶經營', icon: 'link', tint: '#F1EAFD' },
    { id: 'shop', label: '小店家或個人品牌', icon: 'home', tint: '#FFF3DC' },
    { id: 'creator', label: '內容創作者', icon: 'spark', tint: '#FDECEC' },
    { id: 'other', label: '其他', icon: 'more', tint: '#EEF0F3' },
  ] },
  { key: 'accounts', title: '你現在要管理幾個社群帳號？', multi: false, layout: 'chips', choices: [
    { id: '1-3', label: '1–3 個' }, { id: '4-10', label: '4–10 個' }, { id: '11-30', label: '11–30 個' }, { id: '30+', label: '30 個以上' },
  ] },
  { key: 'platforms', title: '主要經營哪些平台？', multi: true, layout: 'tiles', choices: [
    { id: 'facebook', label: 'Facebook 粉專', mark: 'facebook' }, { id: 'instagram', label: 'Instagram', mark: 'instagram' },
    { id: 'line', label: 'LINE 官方帳號', mark: 'line' }, { id: 'other', label: '其他平台', icon: 'plus' },
  ] },
  { key: 'goals', title: '最想先用 kdan-social 做什麼？', multi: true, layout: 'cards', choices: [
    { id: 'schedule', label: '一次排程到多個帳號', hint: '各帳號照自己的時區發出', icon: 'calendar', tint: '#E9EEFD' },
    { id: 'review', label: '團隊送審與核准', hint: '編輯寫好，主管核准才發', icon: 'check', tint: '#E5F4EA' },
    { id: 'ai', label: 'AI 照品牌語氣寫文案', hint: '改寫、縮短、各平台版本', icon: 'spark', tint: '#F1EAFD' },
    { id: 'analytics', label: '看成效報表', hint: '觸及、互動、粉絲成長', icon: 'chart', tint: '#FFF3DC' },
  ] },
];

function Finish({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary ob-continue" disabled={pending}>{pending ? '準備中…' : label} <span aria-hidden="true">→</span></button>;
}

export function Questions({ needsWorkspace, canCreate, zones, suggestedName }: { needsWorkspace: boolean; canCreate: boolean; zones: Array<{ id: string; label: string }>; suggestedName: string }) {
  const [state, action] = useActionState<FinishState, FormData>(finishOnboardingAction, {});
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const total = STEPS.length + (needsWorkspace ? 1 : 0);
  const step = STEPS[i];
  const picked = step ? answers[step.key] ?? [] : [];
  const toggle = (id: string) => setAnswers((a) => {
    const cur = a[step!.key] ?? [];
    return { ...a, [step!.key]: step!.multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id] };
  });
  const payload = JSON.stringify({ describes: answers.describes?.[0], accounts: answers.accounts?.[0], platforms: answers.platforms ?? [], goals: answers.goals ?? [] });
  const next = () => setI((n) => n + 1);

  return (
    <main className="ob">
      <header className="ob-head">
        <button type="button" className="btn icon-btn" aria-label="上一步" disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))} style={{ border: 0, visibility: i === 0 ? 'hidden' : 'visible' }}><Icon name="chevronLeft" /></button>
        <span className="brand"><span className="brand-mark">K</span>kdan-social</span>
        <span className="ob-dots" role="img" aria-label={`第 ${i + 1} 步，共 ${total} 步`}>
          {Array.from({ length: total }, (_, n) => <span key={n} data-on={n === i} data-done={n < i} />)}
        </span>
      </header>

      {step ? (
        <section className="ob-step" key={step.key}>
          <h1 className="ob-title">{step.title}</h1>
          {step.multi && <p className="small muted" style={{ margin: '6px 0 0' }}>可以複選</p>}
          <div className={`ob-choices ob-${step.layout}`} role={step.multi ? 'group' : 'radiogroup'} aria-label={step.title}>
            {step.choices.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button key={c.id} type="button" className="ob-choice" role={step.multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => toggle(c.id)}>
                  {c.mark ? <span className="ob-mark"><PlatformMark pf={c.mark} size={28} /></span>
                    : c.icon ? <span className="ob-icon" style={{ background: c.tint ?? 'var(--sunken)' }}><Icon name={c.icon} size={step.layout === 'tiles' ? 24 : 16} /></span> : null}
                  <span className="ob-label">{c.label}{c.hint && <span className="ob-hint">{c.hint}</span>}</span>
                  {step.multi && step.layout !== 'tiles' && <span className="ob-box" aria-hidden="true">{on && <Icon name="tick" size={12} stroke={3} />}</span>}
                  {step.layout === 'tiles' && on && <span className="ob-corner" aria-hidden="true"><Icon name="tick" size={11} stroke={3} /></span>}
                </button>
              );
            })}
          </div>
          {i === STEPS.length - 1 && !needsWorkspace ? (
            <form action={action}>
              <input type="hidden" name="answers" value={payload} />
              <Finish label="完成" />
            </form>
          ) : (
            <button type="button" className="btn btn-primary ob-continue" disabled={picked.length === 0} onClick={next}>繼續 <span aria-hidden="true">→</span></button>
          )}
          {i === STEPS.length - 1 && !needsWorkspace
            ? <form action={action}><input type="hidden" name="answers" value={payload} /><button type="submit" className="link-btn ob-skip">略過</button></form>
            : <button type="button" className="link-btn ob-skip" onClick={next}>略過</button>}
        </section>
      ) : (
        <section className="ob-step" key="workspace">
          <h1 className="ob-title">最後，幫你的工作區取個名字</h1>
          <p className="small" style={{ color: 'var(--ink-2)', margin: '8px 0 0', maxWidth: 440 }}>一個工作區放一個品牌的帳號、貼文和成員。代理商可以之後每個客戶各建一個。</p>
          {canCreate ? (
            <form action={action} className="ob-form">
              <input type="hidden" name="answers" value={payload} />
              {state.error && <div className="alert" role="alert"><div className="body small">{state.error}</div></div>}
              <div className="field">
                <label htmlFor="ws-name">工作區名稱</label>
                <input id="ws-name" name="name" className="input" required maxLength={60} defaultValue={suggestedName} placeholder="例如：品牌或公司名稱" autoFocus />
              </div>
              <div className="field">
                <label htmlFor="ws-tz">時區</label>
                <select id="ws-tz" name="timeZone" className="select" defaultValue="Asia/Taipei">
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ws-code">邀請碼</label>
                <input id="ws-code" name="code" className="input" required autoComplete="off" />
                <span className="tiny muted">目前開放有邀請碼的團隊建立工作區。</span>
              </div>
              <Finish label="建立工作區" />
            </form>
          ) : (
            <form action={action} className="ob-form">
              <input type="hidden" name="answers" value={payload} />
              <div className="card card-pad small">目前需要被邀請才能使用。請工作區的擁有者或管理員到「成員」頁建立邀請連結傳給你。</div>
              <Finish label="完成" />
            </form>
          )}
        </section>
      )}
    </main>
  );
}
