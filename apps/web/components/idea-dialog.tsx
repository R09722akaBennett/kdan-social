'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './ui';

type IdeaFields = { id?: string; title?: string; body?: string; status: string };

/** Add or edit an idea in a small dialog, after Buffer's "Create Idea": a title, then the thought. */
export function IdeaDialog({ action, idea, className, label, children }: { action: (f: FormData) => void; idea: IdeaFields; className?: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  return (
    <>
      <button type="button" className={className} aria-label={label} onClick={() => setOpen(true)}>{children}</button>
      {open && (
        <div className="connect-scrim" role="dialog" aria-modal="true" aria-labelledby="idea-title" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form action={action} className="card connect-dialog" style={{ width: 'min(520px, 100%)' }}>
            <input type="hidden" name="status" value={idea.status} />
            {idea.id && <input type="hidden" name="id" value={idea.id} />}
            <div className="row" style={{ padding: '16px 18px 0', justifyContent: 'space-between' }}>
              <h2 id="idea-title">{idea.id ? '編輯點子' : '新增點子'}</h2>
              <button type="button" className="btn icon-btn connect-icon" aria-label="關閉" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="stack" style={{ padding: '14px 18px', gap: 12 }}>
              <div className="field">
                <label htmlFor="idea-name">標題</label>
                <input id="idea-name" name="title" className="input" required maxLength={120} defaultValue={idea.title} autoFocus placeholder="例如：雙十一倒數，每天一張圖" />
              </div>
              <div className="field">
                <label htmlFor="idea-body">內容（選填）</label>
                <textarea id="idea-body" name="body" className="input" rows={6} maxLength={5000} defaultValue={idea.body} placeholder="想到什麼先寫下來，之後再轉成貼文。" style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="row" style={{ padding: '12px 18px', justifyContent: 'flex-end', borderTop: '1px solid var(--line-soft)', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>取消</button>
              <button type="submit" className="btn btn-primary">{idea.id ? '儲存' : '新增'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
