'use client';

import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { askAction, type AskState } from '@/app/app/actions';
import { Icon } from './ui';

function Send() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && <span className="tiny muted" role="status">AI 正在讀這個工作區的資料…</span>}
      <button type="submit" className="btn btn-primary icon-btn spacer" aria-label="送出" disabled={pending} style={{ width: 36, height: 36, minHeight: 36 }}>
        <Icon name="send" size={16} stroke={2} />
      </button>
    </>
  );
}

/**
 * The message box under the conversation, and the suggestion pills that send a ready
 * question. Enter sends, Shift+Enter starts a new line.
 */
export function AskForm({ conversation, suggestions }: { conversation?: string; suggestions: string[] }) {
  const [state, action] = useActionState<AskState, FormData>(askAction, {});
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const ask = (q: string) => { if (box.current) box.current.value = q; form.current?.requestSubmit(); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {suggestions.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {suggestions.map((q) => <button key={q} type="button" className="pill" onClick={() => ask(q)}>{q}</button>)}
        </div>
      )}
      {state.error && <div className="alert" role="alert"><div className="body">{state.error}</div></div>}
      <form ref={form} action={action} className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'var(--control)' }}>
        {conversation && <input type="hidden" name="conversation" value={conversation} />}
        <label htmlFor="msg" className="sr-only">輸入訊息</label>
        <textarea ref={box} id="msg" name="message" rows={2} maxLength={2000} required defaultValue={state.message} key={state.message ?? ''}
          placeholder="問成效、請它排內容、或寫一篇貼文的初稿"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); form.current?.requestSubmit(); } }}
          style={{ border: 0, outline: 'none', resize: 'none', font: 'inherit' }} />
        <div className="row tiny" style={{ gap: 6 }}>
          <span className="chip chip-neutral">資料：近 30 天成效、未來 21 天排程</span>
          <Send />
        </div>
      </form>
    </div>
  );
}
