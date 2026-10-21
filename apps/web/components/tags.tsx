'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

export type TagView = { id: string; name: string; color: string };

/** A tag as a small colored pill, after Buffer's. */
export function TagPill({ tag }: { tag: TagView }) {
  return <span className={`tag tag-${tag.color}`}>{tag.name}</span>;
}

/**
 * The composer's tag menu, after Buffer's: search, tick, and type a new name to create it
 * on the spot. Only ids leave this component; the post saves them.
 */
export function TagPicker({ tags, value, onChange, create }: {
  tags: TagView[];
  value: string[];
  onChange: (ids: string[]) => void;
  create: (name: string) => Promise<TagView | { error: string }>;
}) {
  const [all, setAll] = useState(tags);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const name = q.trim();
  const shown = all.filter((t) => t.name.toLowerCase().includes(name.toLowerCase()));
  const exact = all.some((t) => t.name.toLowerCase() === name.toLowerCase());
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const add = async () => {
    setBusy(true);
    setError('');
    const res = await create(name);
    setBusy(false);
    if ('error' in res) return setError(res.error);
    setAll((list) => (list.some((t) => t.id === res.id) ? list : [...list, res].sort((x, y) => x.name.localeCompare(y.name))));
    if (!value.includes(res.id)) onChange([...value, res.id]);
    setQ('');
  };
  const chosen = all.filter((t) => value.includes(t.id));
  return (
    <div ref={ref} className="row" style={{ position: 'relative', gap: 6 }}>
      <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" size={14} />標籤{chosen.length ? `（${chosen.length}）` : ''}
      </button>
      {chosen.map((t) => <TagPill key={t.id} tag={t} />)}
      {open && (
        <div className="card tag-menu" role="dialog" aria-label="選擇標籤">
          <input className="input" value={q} autoFocus placeholder="搜尋或輸入新標籤" aria-label="搜尋或輸入新標籤" onChange={(e) => { setQ(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (name && !exact && !busy) void add(); } }} style={{ minHeight: 32 }} />
          <div className="tag-menu-list">
            {shown.map((t) => (
              <label key={t.id} className="row tag-menu-item">
                <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} style={{ accentColor: 'var(--accent)' }} />
                <TagPill tag={t} />
              </label>
            ))}
            {shown.length === 0 && !name && <div className="tiny muted" style={{ padding: '6px 4px' }}>還沒有標籤，輸入名稱就能建立。</div>}
          </div>
          {name && !exact && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void add()}>{busy ? '建立中…' : `建立「${name}」`}</button>}
          {error && <div className="tiny" style={{ color: 'var(--err)' }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
