'use client';

import { useEffect, useState } from 'react';
import { Icon } from './ui';

const KEY = 'kdan-social:channel-welcome-dismissed';

/**
 * The card an account's queue opens with until it is dismissed, after Buffer's
 * "Welcome to your Queue!". Dismissing is remembered in this browser only; it is a
 * reading aid, not a setting.
 */
export function ChannelWelcome() {
  // Hidden until the browser says otherwise, so it never flashes for someone who closed it.
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== '1');
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
  };
  return (
    <section className="card channel-welcome" aria-labelledby="h-welcome">
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 id="h-welcome">這是這個帳號的排程</h2>
        <p className="small" style={{ margin: '6px 0 0', color: 'var(--ink-2)' }}>
          排好的貼文會照<strong>這個帳號自己的時區</strong>列在這裡。還沒想好時間的先存成草稿，送審中的在「待審核」，發出去的在「已發送」。
        </p>
        <button type="button" className="btn btn-sm" style={{ marginTop: 12 }} onClick={close}>知道了</button>
      </div>
      <div className="channel-welcome-art" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="channel-welcome-row">
            <span className="skel-static" style={{ width: 34 }} />
            <span className="skel-static" style={{ flex: 1 }} />
            <span className="channel-welcome-thumb"><Icon name="calendar" size={12} /></span>
          </span>
        ))}
      </div>
    </section>
  );
}
