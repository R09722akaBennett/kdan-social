import { useState } from 'react';
import { useStore } from '../store.jsx';
import { fmt, PF, TIME_ZONES } from '../data.js';
import { FilterMenu, GroupTag, Icon, Pf } from '../components/ui.jsx';

function statusOf(a, expired) {
  if (expired) return { label: '授權失效（10/18）', color: 'var(--err)', detail: '可能是授權者改了密碼或被移除粉專權限。2 篇排程貼文受影響。' };
  if (a.quota) return { label: a.quota.used > 50 ? `本月額度已用 ${a.quota.used}%` : '正常', color: a.quota.used > 50 ? 'var(--warn)' : 'var(--ok)', detail: `剩 ${fmt(a.quota.left)} 則；每月 1 日重置`, quota: a.quota.used };
  return { label: '正常', color: 'var(--ok)', detail: '今天 09:00 檢查過，授權有效' };
}

/** New / edit group dialog, after Buffer's "New Channel Group": a name and a checklist of accounts. */
function GroupDialog({ group, onClose }) {
  const { accounts, groupName, saveGroup } = useStore();
  const [name, setName] = useState(group?.name ?? '');
  const [picked, setPicked] = useState(() => accounts.filter((a) => group && a.group === group.id).map((a) => a.id));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,30,.35)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card" style={{ width: 'min(480px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) { saveGroup(group?.id ?? null, name.trim(), picked); onClose(); } }}>
        <div className="row" style={{ padding: '16px 18px', justifyContent: 'space-between' }}>
          <h2 id="group-dialog-title">{group ? '編輯群組' : '新增群組'}</h2>
          <button type="button" className="btn icon-btn" aria-label="關閉" onClick={onClose} style={{ border: 0, width: 32, height: 32, minHeight: 32 }}><Icon name="close" size={16} /></button>
        </div>
        <div className="stack" style={{ padding: '0 18px', gap: 14, overflowY: 'auto' }}>
          <div className="field">
            <label htmlFor="gname">名稱</label>
            <input id="gname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：台灣、子品牌 A、門市" autoFocus />
          </div>
          <div className="field">
            <span className="label">帳號 <span className="tiny muted">{picked.length}</span></span>
            {accounts.map((a) => {
              const moving = a.group && a.group !== group?.id && picked.includes(a.id);
              return (
                <label key={a.id} className="row" style={{ minHeight: 48, borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', flexWrap: 'nowrap' }}>
                  <Pf pf={a.pf} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block' }}>{a.name}</span>
                    <span className="tiny muted">{PF[a.pf].name}{a.group && a.group !== group?.id ? ` · 目前在「${groupName(a.group)}」` : ''}</span>
                    {moving && <span className="tiny" style={{ display: 'block', color: 'var(--warn)' }}>儲存後會從「{groupName(a.group)}」移到這個群組</span>}
                  </span>
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} />
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

export default function Channels() {
  const { state, reconnect, toast, accounts, groups, groupName, setAccountTz, deleteGroup } = useStore();
  const [filter, setFilter] = useState([]);
  const [dialog, setDialog] = useState(null);
  const shown = accounts.filter((a) => filter.length === 0 || filter.includes(a.group ?? 'none'));

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>帳號與群組</h1>
          <div className="sub">連結的社群帳號，以及你自己分的群組。群組讓你發文時一鍵選取一組帳號。</div>
        </div>
        <a className="btn btn-primary" href="#add">連結新帳號</a>
      </header>

      <section className="card" aria-labelledby="h-accounts" style={{ overflow: 'visible' }}>
        <div className="card-head">
          <h2 id="h-accounts">帳號 <span className="small muted">{accounts.length}</span></h2>
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} value={filter} onChange={setFilter} />
        </div>
        {shown.map((a) => {
          const expired = !!state.expired[a.id];
          const s = statusOf(a, expired);
          return (
            <div key={a.id} className="list-row" style={{ background: expired ? '#FFFAF9' : '#fff' }}>
              <Pf pf={a.pf} size="lg" />
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}><span style={{ fontWeight: 600 }}>{a.name}</span><GroupTag name={a.group ? groupName(a.group) : null} /></div>
                <div className="small muted">{a.kind} · {a.pf === 'line' ? '好友' : '追蹤'} {fmt(a.followers)}</div>
              </div>
              <label className="row small" style={{ gap: 6, color: 'var(--ink-2)' }}>
                <span>時區</span>
                <select className="select" value={a.tz} onChange={(e) => { setAccountTz(a.id, e.target.value); toast(`「${a.name}」的時區已改為 ${TIME_ZONES.find((z) => z.id === e.target.value).label}`); }} style={{ minHeight: 34, fontSize: 13 }}>
                  {TIME_ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
              </label>
              <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="row small" style={{ gap: 6, fontWeight: 500, color: s.color }}><span className="dot" style={{ background: s.color }} />{s.label}</span>
                <span className="tiny" style={{ color: 'var(--ink-2)' }}>{s.detail}</span>
                {s.quota !== undefined && (
                  <span role="img" aria-label={`本月訊息額度已用 ${s.quota}%`} style={{ height: 6, borderRadius: 3, background: 'var(--line-soft)', overflow: 'hidden', maxWidth: 200, display: 'block' }}>
                    <span style={{ display: 'block', height: 6, width: `${s.quota}%`, background: s.quota > 50 ? 'var(--warn-bar)' : 'var(--ok)' }} />
                  </span>
                )}
              </div>
              {expired && <button type="button" className="btn btn-danger" onClick={() => reconnect(a.id)}>重新連結</button>}
            </div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="h-groups">
        <div className="card-head">
          <div>
            <h2 id="h-groups">群組</h2>
            <div className="small muted">把常一起發文的帳號放在一起，名稱由你決定（國家、子品牌、門市都可以）。一個帳號只會在一個群組裡。</div>
          </div>
          <button type="button" className="btn" onClick={() => setDialog({})}><Icon name="plus" size={16} />新增群組</button>
        </div>
        {groups.length === 0 && <div className="list-row small muted">還沒有群組。不分組也能正常發文。</div>}
        {groups.map((g) => {
          const list = accounts.filter((a) => a.group === g.id);
          return (
            <div key={g.id} className="list-row">
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="row" style={{ gap: 4, marginTop: 4 }}>
                  {list.length === 0 && <span className="tiny muted">沒有帳號</span>}
                  {list.map((a) => <span key={a.id} className="row tiny muted" style={{ gap: 4, marginRight: 8 }}><Pf pf={a.pf} size="sm" />{a.name}</span>)}
                </div>
              </div>
              <button type="button" className="btn icon-btn" aria-label={`編輯「${g.name}」`} onClick={() => setDialog({ group: g })} style={{ width: 36, height: 36, minHeight: 36 }}><Icon name="edit" size={16} /></button>
              <button type="button" className="btn icon-btn" aria-label={`刪除「${g.name}」`} onClick={() => deleteGroup(g.id)} style={{ width: 36, height: 36, minHeight: 36, color: 'var(--err)' }}><Icon name="trash" size={16} /></button>
            </div>
          );
        })}
      </section>

      <section className="stack" aria-labelledby="h-add" id="add">
        <h2 id="h-add">連結新帳號</h2>
        <div className="grid" style={{ '--min': '300px' }}>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Facebook 粉專＋Instagram</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>用 Facebook 登入一次，勾選要加入的粉專；粉專綁定的 IG 商業帳號會跟著加入。</div>
            <button type="button" className="btn" style={{ background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600, minHeight: 44 }} onClick={() => toast('原型：略過 Meta 授權畫面')}>用 Facebook 繼續</button>
          </div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>LINE 官方帳號</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>每個官方帳號各自貼一組 Messaging API 憑證。</div>
            <button type="button" className="btn" style={{ minHeight: 44, fontWeight: 600 }} onClick={() => toast('原型：LINE 憑證表單')}>貼上 channel 憑證</button>
          </div>
        </div>
        <div className="small muted">不支援：Facebook 個人頁、Facebook 社團、Instagram 個人帳號（平台沒有開放發文 API）；LINE VOOM 貼文。</div>
      </section>

      {dialog && <GroupDialog group={dialog.group} onClose={() => setDialog(null)} />}
    </main>
  );
}
