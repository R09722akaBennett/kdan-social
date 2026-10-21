'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './ui';

const PRESETS = [
  { goal: 1, title: '保持穩定', detail: '每週 1 篇' },
  { goal: 3, title: '建立存在感', detail: '每週 3 篇' },
  { goal: 5, title: '衝高曝光', detail: '每週 5 篇' },
] as const;

/**
 * Pick an account's weekly posting goal, after Buffer's "Stay Consistent With a Posting
 * Goal": three common rhythms or a number of one's own.
 */
export function GoalDialog({ action, accountId, current, className, children }: { action: (f: FormData) => void; accountId: string; current: number | null; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const preset = PRESETS.some((p) => p.goal === current);
  const [choice, setChoice] = useState<string>(current == null ? '3' : preset ? String(current) : 'custom');
  const [custom, setCustom] = useState(current != null && !preset ? String(current) : '7');
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      {open && (
        <div className="connect-scrim" role="dialog" aria-modal="true" aria-labelledby="goal-title" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form action={action} className="card connect-dialog" style={{ width: 'min(480px, 100%)' }}>
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="goal" value={choice === 'custom' ? custom : choice} />
            <div className="row connect-bar-top">
              <span className="spacer" />
              <button type="button" className="btn icon-btn connect-icon" aria-label="關閉" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="connect-body" style={{ paddingTop: 0 }}>
              <h2 id="goal-title" className="connect-title">設定每週發文目標</h2>
              <p className="small muted connect-sub">排程頁會照目標列出空的時段，帳號頁也會顯示本週進度。</p>
              <div role="radiogroup" aria-label="每週目標" className="stack" style={{ gap: 8 }}>
                {PRESETS.map((p) => (
                  <button key={p.goal} type="button" role="radio" aria-checked={choice === String(p.goal)} className="goal-option" onClick={() => setChoice(String(p.goal))}>
                    <span className="goal-num num">{p.goal}x</span>
                    <span style={{ flex: 1 }}><strong>{p.title}</strong><span className="small muted"> · {p.detail}</span></span>
                  </button>
                ))}
                <div role="radio" aria-checked={choice === 'custom'} className="goal-option" tabIndex={0} onClick={() => setChoice('custom')} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setChoice('custom'); } }}>
                  <span className="goal-num"><Icon name="edit" size={14} /></span>
                  <span style={{ flex: 1 }}><strong>自訂</strong></span>
                  <label className="row small" style={{ gap: 6 }}>
                    每週
                    <input type="number" min={1} max={21} value={custom} aria-label="自訂每週篇數" className="input" style={{ width: 64, minHeight: 30 }}
                      onFocus={() => setChoice('custom')} onChange={(e) => setCustom(e.target.value)} />
                    篇
                  </label>
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                {current != null ? <button type="submit" name="clear" value="1" className="btn btn-sm">清除目標</button> : <span />}
                <button type="submit" className="btn btn-primary">儲存目標</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
