'use client';

import { useEffect, useRef, useState } from 'react';
import { ROLE_TEXT } from './roles';
import { Icon } from './ui';

type Ws = { id: string; name: string; role: string };

/** The sidebar's workspace card as a menu, after Fibery's "Switch Workspace": every workspace, the current one ticked, then "建立新工作區". */
export function WorkspaceSwitcher({ current, detail, list, action }: { current: Ws; detail: string; list: Ws[]; action: (f: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const mark = (name: string) => name.slice(0, 2).toUpperCase();
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="workspace" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
        <span className="ws-mark">{mark(current.name)}</span>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</span>
          <span className="tiny muted">{detail}</span>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="card" role="menu" aria-label="切換工作區" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 30, padding: 6, boxShadow: '0 8px 24px rgba(20,24,30,.12)' }}>
          <div className="tiny muted" style={{ padding: '4px 8px' }}>工作區</div>
          {list.map((w) => (
            <form key={w.id} action={action}>
              <input type="hidden" name="workspaceId" value={w.id} />
              <button type="submit" role="menuitemradio" aria-checked={w.id === current.id} className="row small"
                style={{ width: '100%', minHeight: 40, padding: '0 8px', border: 0, borderRadius: 6, background: w.id === current.id ? 'var(--line-soft)' : 'transparent', cursor: 'pointer', flexWrap: 'nowrap', gap: 8, textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                <span className="ws-mark" style={{ width: 22, height: 22, borderRadius: 5, fontSize: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: 'none' }}>{mark(w.name)}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <span className="tiny muted">{ROLE_TEXT[w.role]?.name}</span>
                <span style={{ width: 16, display: 'flex', color: 'var(--accent)' }}>{w.id === current.id && <Icon name="tick" size={16} stroke={2.2} />}</span>
              </button>
            </form>
          ))}
          <div style={{ borderTop: '1px solid var(--line-soft)', margin: '6px 0' }} />
          <a href="/app/workspaces/new" role="menuitem" className="row small" style={{ minHeight: 38, padding: '0 8px', borderRadius: 6, color: 'var(--ink)', gap: 8 }}>
            <Icon name="plus" size={16} />建立新工作區
          </a>
          <a href="/app/settings" role="menuitem" className="row small" style={{ minHeight: 38, padding: '0 8px', borderRadius: 6, color: 'var(--ink)', gap: 8 }}>
            <Icon name="settings" size={16} />這個工作區的設定
          </a>
        </div>
      )}
    </div>
  );
}
