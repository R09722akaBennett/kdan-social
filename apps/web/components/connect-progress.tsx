'use client';

import { useEffect, useState } from 'react';
import { Icon } from './ui';

const KEY = 'kdan.connectProgress.hidden';

/** "已連結 n/3 個平台" with a three-part bar, after Buffer's channels-connected card; hidden once closed. */
export function ConnectProgress({ done, total }: { done: number; total: number }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(KEY) === '1'); } catch { setHidden(false); }
  }, []);
  if (hidden || done >= total) return null;
  return (
    <div className="connect-progress">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <span className="small" style={{ fontWeight: 600 }}>已連結 {done}/{total} 個平台</span>
        <button type="button" className="btn icon-btn" aria-label="關閉" onClick={() => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* the card simply returns next visit */ } }} style={{ border: 0, width: 24, height: 24, minHeight: 24 }}><Icon name="close" size={14} /></button>
      </div>
      <span className="connect-bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="已連結的平台">
        {Array.from({ length: total }, (_, i) => <span key={i} data-on={i < done} />)}
      </span>
    </div>
  );
}
