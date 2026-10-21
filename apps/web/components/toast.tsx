'use client';

import { useEffect, useState } from 'react';
import { Icon } from './ui';

type Tone = 'ok' | 'warn' | 'err' | 'plan';

/**
 * A notice that floats over the page and goes away, after Buffer's "Posting goal created
 * successfully" toast. Errors stay until closed, since they ask the person to act.
 *
 * `?notice` is dropped from the address as soon as it shows, so a refresh or a shared
 * link does not repeat it.
 */
export function NoticeToast({ text, tone = 'ok' }: { text: string; tone?: Tone }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // A server action redirecting back to the same page reuses this component with new text.
    setOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('notice');
    url.searchParams.delete('n');
    window.history.replaceState(window.history.state, '', url);
    if (tone === 'err') return;
    const t = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(t);
  }, [text, tone]);
  if (!open) return null;
  return (
    <div className={`notice-toast notice-${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      <span className="notice-mark" aria-hidden="true"><Icon name={tone === 'ok' || tone === 'plan' ? 'tick' : 'alert'} size={14} stroke={2.4} /></span>
      <span style={{ flex: 1 }}>{text}</span>
      <button type="button" className="notice-close" aria-label="關閉提示" onClick={() => setOpen(false)}><Icon name="close" size={14} /></button>
    </div>
  );
}
