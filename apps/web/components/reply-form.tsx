'use client';

import { useFormStatus } from 'react-dom';

function Send() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>{pending ? '送出中…' : '回覆'}</button>;
}

/** Answer one comment in place, after Buffer's "Replying to @user" box. */
export function ReplyForm({ action, id, author, back }: { action: (f: FormData) => void; id: string; author: string; back: string }) {
  return (
    <form action={action} className="reply-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <label className="sr-only" htmlFor={`reply-${id}`}>回覆 {author}</label>
      <textarea id={`reply-${id}`} name="text" className="input" rows={2} maxLength={2200} required placeholder={`回覆 ${author}…`} />
      <div className="row" style={{ justifyContent: 'flex-end' }}><Send /></div>
    </form>
  );
}
