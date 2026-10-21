'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './ui';

/** The prototype's layout: a sidebar that becomes a slide-in menu below 900px. */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className={open ? 'app nav-open' : 'app'}>
      {sidebar}
      <div className="scrim" onClick={() => setOpen(false)} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <button type="button" className="btn icon-btn" aria-label="開啟選單" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <span style={{ fontWeight: 600 }}>kdan-social</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export type NavItem = { href: string; label: string; icon: IconName; badge?: { n: number; bg: string; fg: string } };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const current = (href: string) => (href === '/app' ? path === '/app' : path.startsWith(href));
  return (
    <nav className="nav" aria-label="主選單">
      {items.map((n) => (
        <Link key={n.href} href={n.href} aria-current={current(n.href) ? 'page' : undefined}>
          <Icon name={n.icon} />
          <span className="label">{n.label}</span>
          {n.badge && n.badge.n > 0 && <span className="count" style={{ background: n.badge.bg, color: n.badge.fg }}>{n.badge.n}</span>}
        </Link>
      ))}
    </nav>
  );
}
