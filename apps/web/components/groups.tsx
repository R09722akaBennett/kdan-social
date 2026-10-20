'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon, Pf, PLATFORM, type Platform } from './ui';

type Option = { id: string; label: string; hint?: string };

/**
 * A filter button with a searchable checklist, as Buffer's calendar "Channels" filter.
 * The choice lives in the URL as repeated `param` values, so server pages can read it.
 */
export function FilterMenu({ label, options, param = 'group' }: { label: string; options: Option[]; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const value = search.getAll(param);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const set = (next: string[]) => {
    const p = new URLSearchParams(search.toString());
    p.delete(param);
    for (const v of next) p.append(param, v);
    router.push(p.size ? `${path}?${p}` : path);
  };
  const toggle = (id: string) => set(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        {value.length > 0 && <span className="count" style={{ background: 'var(--accent)', color: '#fff' }}>{value.length}</span>}
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="card" role="dialog" aria-label={`篩選${label}`} style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, width: 240, padding: 8, boxShadow: '0 8px 24px rgba(20,24,30,.12)' }}>
          <input className="input" placeholder={`搜尋${label}`} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', minHeight: 34, fontSize: 13, marginBottom: 6 }} />
          {shown.map((o) => (
            <label key={o.id} className="row small" style={{ minHeight: 36, padding: '0 6px', borderRadius: 6, cursor: 'pointer', flexWrap: 'nowrap' }}>
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} style={{ accentColor: 'var(--accent)' }} />
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.hint && <span className="tiny muted">{o.hint}</span>}
            </label>
          ))}
          {shown.length === 0 && <div className="tiny muted" style={{ padding: 6 }}>沒有符合的{label}</div>}
          {value.length > 0 && <button type="button" className="btn btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={() => set([])}>清除篩選</button>}
        </div>
      )}
    </div>
  );
}

export type DialogAccount = { id: string; name: string; platform: Platform; groupId: string | null };
type Group = { id: string; name: string };

/** New / edit group dialog, after Buffer's "New Channel Group": a name and a checklist of accounts. */
function GroupDialog({ group, groups, accounts, action, onClose }: { group?: Group; groups: Group[]; accounts: DialogAccount[]; action: (f: FormData) => void; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [picked, setPicked] = useState(() => accounts.filter((a) => group && a.groupId === group.id).map((a) => a.id));
  const nameOf = (id: string | null) => groups.find((g) => g.id === id)?.name;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,30,.35)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form action={action} className="card" style={{ width: 'min(480px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {group && <input type="hidden" name="groupId" value={group.id} />}
        <div className="row" style={{ padding: '16px 18px', justifyContent: 'space-between' }}>
          <h2 id="group-dialog-title">{group ? '編輯群組' : '新增群組'}</h2>
          <button type="button" className="btn icon-btn" aria-label="關閉" onClick={onClose} style={{ border: 0, width: 32, height: 32, minHeight: 32 }}><Icon name="close" size={16} /></button>
        </div>
        <div className="stack" style={{ padding: '0 18px', gap: 14, overflowY: 'auto' }}>
          <div className="field">
            <label htmlFor="gname">名稱</label>
            <input id="gname" name="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：台灣、子品牌 A、門市" maxLength={40} autoFocus />
          </div>
          <div className="field">
            <span className="label">帳號 <span className="tiny muted">{picked.length}</span></span>
            {accounts.length === 0 && <span className="small muted">還沒有連結任何帳號。</span>}
            {accounts.map((a) => {
              const elsewhere = a.groupId && a.groupId !== group?.id ? nameOf(a.groupId) : null;
              return (
                <label key={a.id} className="row" style={{ minHeight: 48, borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', flexWrap: 'nowrap' }}>
                  <Pf pf={a.platform} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block' }}>{a.name}</span>
                    <span className="tiny muted">{PLATFORM[a.platform].name}{elsewhere ? ` · 目前在「${elsewhere}」` : ''}</span>
                    {elsewhere && picked.includes(a.id) && <span className="tiny" style={{ display: 'block', color: 'var(--warn)' }}>儲存後會從「{elsewhere}」移到這個群組</span>}
                  </span>
                  <input type="checkbox" name="accountId" value={a.id} checked={picked.includes(a.id)} onChange={() => toggle(a.id)} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} />
                </label>
              );
            })}
          </div>
        </div>
        <div className="row" style={{ padding: '14px 18px', justifyContent: 'flex-end', borderTop: '1px solid var(--line-soft)', marginTop: 12 }}>
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>儲存</button>
        </div>
      </form>
    </div>
  );
}

/** The "新增群組" button, or an edit button for one group, each opening the dialog. */
export function GroupDialogButton({ group, groups, accounts, action }: { group?: Group; groups: Group[]; accounts: DialogAccount[]; action: (f: FormData) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {group
        ? <button type="button" className="btn icon-btn" aria-label={`編輯「${group.name}」`} onClick={() => setOpen(true)} style={{ width: 36, height: 36, minHeight: 36 }}><Icon name="edit" size={16} /></button>
        : <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="plus" size={16} />新增群組</button>}
      {open && <GroupDialog group={group} groups={groups} accounts={accounts} action={action} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A delete button that asks first, since the group's name is lost (its accounts are not). */
export function DeleteGroupButton({ group, action }: { group: Group; action: (f: FormData) => void }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(`刪除群組「${group.name}」？帳號本身不會被移除。`)) e.preventDefault(); }}>
      <input type="hidden" name="groupId" value={group.id} />
      <button type="submit" className="btn icon-btn" aria-label={`刪除「${group.name}」`} style={{ width: 36, height: 36, minHeight: 36, color: 'var(--err)' }}><Icon name="trash" size={16} /></button>
    </form>
  );
}

/** An account's time zone select that saves as soon as it changes. */
export function TimeZoneSelect({ accountId, accountName, value, options, action }: { accountId: string; accountName: string; value: string; options: Option[]; action: (f: FormData) => void }) {
  return (
    <form action={action} className="row small" style={{ gap: 6, color: 'var(--ink-2)' }}>
      <input type="hidden" name="accountId" value={accountId} />
      <label htmlFor={`tz-${accountId}`}>時區</label>
      <select id={`tz-${accountId}`} name="timeZone" className="select" defaultValue={value} aria-label={`「${accountName}」的時區`} onChange={(e) => e.currentTarget.form?.requestSubmit()} style={{ minHeight: 34, fontSize: 13 }}>
        {options.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
      </select>
    </form>
  );
}
