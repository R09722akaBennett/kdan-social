import { useState } from 'react';
import { Link } from '../router.jsx';
import { useStore } from '../store.jsx';
import { Icon } from './ui.jsx';

const NAV = [
  { to: '/', label: '總覽', icon: 'home' },
  { to: '/calendar', label: '行事曆', icon: 'calendar' },
  { to: '/approvals', label: '待審核', icon: 'check', badge: 'approvals' },
  { to: '/assistant', label: 'AI 助理', icon: 'spark' },
  { to: '/analytics', label: '成效', icon: 'chart' },
  { to: '/channels', label: '帳號與群組', icon: 'link', badge: 'accounts' },
  { to: '/voice', label: '品牌語氣', icon: 'voice' },
];

function Sidebar({ path, onNavigate }) {
  const { pendingItems, expiredIds, reset, accounts, groups } = useStore();
  const badges = {
    approvals: pendingItems.length ? { n: pendingItems.length, bg: 'var(--warn-soft)', fg: 'var(--warn)' } : null,
    accounts: expiredIds.length ? { n: expiredIds.length, bg: 'var(--err-soft)', fg: 'var(--err)' } : null,
  };
  return (
    <aside className="sidebar" aria-label="側欄">
      <div className="brand"><span className="brand-mark">K</span>kdan-social</div>
      <button type="button" className="workspace">
        <span className="ws-mark">KD</span>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>KDAN Mobile</span>
          <span className="tiny muted">{accounts.length} 個帳號 · {groups.length} 個群組</span>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>
      <Link to="/compose" className="btn btn-primary" onClick={onNavigate} style={{ minHeight: 44 }}>
        <Icon name="plus" stroke={2} />新增貼文
      </Link>
      <nav className="nav" aria-label="主選單">
        {NAV.map((n) => {
          const b = n.badge && badges[n.badge];
          return (
            <Link key={n.to} to={n.to} onClick={onNavigate} aria-current={path === n.to ? 'page' : undefined}>
              <Icon name={n.icon} />
              <span className="label">{n.label}</span>
              {b && <span className="count" style={{ background: b.bg, color: b.fg }}>{b.n}</span>}
            </Link>
          );
        })}
      </nav>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="side-section-title">群組</div>
        {groups.map((g) => {
          const list = accounts.filter((a) => a.group === g.id);
          const bad = list.some((a) => expiredIds.includes(a.id));
          return (
            <Link key={g.id} to="/channels" className="market-link" onClick={onNavigate}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              <span className="tiny muted num">{list.length}</span>
              <span className="dot" role="img" aria-label={bad ? '有帳號需重新連結' : '正常'} style={{ background: bad ? 'var(--err)' : 'var(--ok)' }} />
            </Link>
          );
        })}
        <Link to="/channels" className="market-link" onClick={onNavigate} style={{ color: 'var(--ink-3)' }}>
          <Icon name="plus" size={14} /><span className="small">新增群組</span>
        </Link>
      </div>
      <div className="side-foot">
        <div>原型 · 資料為示意</div>
        <button type="button" onClick={reset} style={{ border: 0, background: 'none', padding: 0, marginTop: 4, color: 'var(--accent)', fontSize: 12 }}>重設示範狀態</button>
      </div>
    </aside>
  );
}

export default function Layout({ path, children }) {
  const [open, setOpen] = useState(false);
  const { state } = useStore();
  return (
    <div className={open ? 'app nav-open' : 'app'}>
      <Sidebar path={path} onNavigate={() => setOpen(false)} />
      <div className="scrim" onClick={() => setOpen(false)} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <button type="button" className="btn icon-btn" aria-label="開啟選單" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <span style={{ fontWeight: 600 }}>kdan-social</span>
        </div>
        {children}
      </div>
      {state.toast && <div className="toast" role="status">{state.toast.msg}</div>}
    </div>
  );
}
