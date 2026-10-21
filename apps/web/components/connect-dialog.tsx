'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { PlatformMark } from './brand-icons';
import { Icon } from './ui';

type Pf = 'facebook' | 'instagram' | 'line';

const TILES: Array<{ pf: Pf; name: string; kind: string }> = [
  { pf: 'facebook', name: 'Facebook', kind: '粉絲專頁' },
  { pf: 'instagram', name: 'Instagram', kind: '商業或創作者帳號' },
  { pf: 'line', name: 'LINE', kind: '官方帳號' },
];

/** What each platform needs before its connect page, with the page it leads to. */
function Detail({ pf }: { pf: Pf }) {
  if (pf === 'instagram') {
    // After Buffer's "How would you like to connect your Instagram account?": what works
    // with each account type, side by side, so a personal account is turned away up front.
    return (
      <>
        <h2 className="connect-title">要連結哪種 Instagram 帳號？</h2>
        <p className="small muted connect-sub">Instagram 透過綁定的 Facebook 粉專連結，能用的功能依帳號類型而定。</p>
        <div className="connect-options">
          <div className="card connect-option">
            <div style={{ fontWeight: 600 }}>商業或創作者帳號</div>
            <ul className="connect-list">
              <li><Icon name="tick" size={14} stroke={2.4} />排程自動發文</li>
              <li><Icon name="tick" size={14} stroke={2.4} />粉絲數與每篇互動</li>
              <li><Icon name="tick" size={14} stroke={2.4} />和粉專一起連結，一次完成</li>
            </ul>
            <Link href="/app/connect/facebook" className="btn btn-primary">透過 Facebook 連結</Link>
            <span className="tiny muted">IG 帳號要先綁定到你管理的粉專。</span>
          </div>
          <div className="card connect-option" style={{ background: 'var(--sunken)' }}>
            <div style={{ fontWeight: 600 }}>個人帳號</div>
            <p className="small muted" style={{ margin: 0 }}>Instagram 沒有開放個人帳號的發文 API，所以無法連結。</p>
            <p className="small muted" style={{ margin: 0 }}>在 Instagram App 的「設定 → 帳號類型和工具」可以免費切換成專業帳號，之後再回來連結。</p>
          </div>
        </div>
      </>
    );
  }
  const fb = pf === 'facebook';
  return (
    <>
      <h2 className="connect-title">{fb ? '連結 Facebook 粉絲專頁' : '連結 LINE 官方帳號'}</h2>
      <p className="small muted connect-sub">{fb ? '用 Facebook 登入一次，勾選要加入的粉專；粉專綁定的 IG 商業帳號會一起加入。' : '每個官方帳號各自貼上 Messaging API channel 的 ID 與 secret。'}</p>
      <div className="card connect-option" style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <div style={{ fontWeight: 600 }}>開始前確認</div>
        <ul className="connect-list">
          {(fb
            ? ['你是粉專的管理員，或有完整控制權', '授權時保留所有權限的勾選']
            : ['已在 LINE Developers 建立 Messaging API channel', '手邊有 Channel ID 與 Channel secret']
          ).map((t) => <li key={t}><Icon name="tick" size={14} stroke={2.4} />{t}</li>)}
        </ul>
        <Link href={fb ? '/app/connect/facebook' : '/app/connect/line'} className="btn btn-primary">{fb ? '繼續連結 Facebook' : '貼上 channel 憑證'}</Link>
        <span className="tiny muted">{fb ? '不支援個人頁與社團，平台沒有開放它們的發文 API。' : '不支援 LINE VOOM 貼文。'}</span>
      </div>
    </>
  );
}

/**
 * The connect dialog after Buffer's "Connect a New Channel": pick a platform, see what it
 * needs, then go on to its connect page. `start` opens straight on one platform, as
 * Buffer's sidebar links do.
 */
export function ConnectDialog({ start, className, children }: { start?: Pf; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pf, setPf] = useState<Pf | undefined>(start);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => { setPf(start); setOpen(true); }}>{children}</button>
      {open && (
        <div className="connect-scrim" role="dialog" aria-modal="true" aria-label="連結社群帳號" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="card connect-dialog">
            <div className="row connect-bar-top">
              {pf ? <button type="button" className="btn icon-btn connect-icon" aria-label="選擇其他平台" onClick={() => setPf(undefined)}><Icon name="chevronLeft" size={16} /></button> : <span style={{ width: 32 }} />}
              <span className="spacer" />
              <button type="button" className="btn icon-btn connect-icon" aria-label="關閉" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="connect-body">
              {pf ? <Detail pf={pf} /> : (
                <>
                  <h2 className="connect-title">連結社群帳號</h2>
                  <div className="connect-tiles">
                    {TILES.map((t) => (
                      <button key={t.pf} type="button" className="card connect-tile" onClick={() => setPf(t.pf)}>
                        <PlatformMark pf={t.pf} size={28} />
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                        <span className="small muted">{t.kind}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
