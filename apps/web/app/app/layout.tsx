import { listAccounts, listMarkets, overviewCounts } from '@kdan-social/core';
import type { ReactNode } from 'react';
import { AppShell, NavLinks, type NavItem } from '@/components/AppShell';
import { Icon, localTime } from '@/components/ui';
import { currentMember } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { signOut } from './actions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await currentMember();
  if (!membership) return <>{children}</>;

  const db = getDb();
  const ws = membership.workspace;
  const [markets, accounts, counts] = await Promise.all([listMarkets(db, ws.id), listAccounts(db, ws.id), overviewCounts(db, { workspaceId: ws.id })]);
  const expired = accounts.filter((a) => a.status !== 'active');
  const nav: NavItem[] = [
    { href: '/app', label: '總覽', icon: 'home' },
    { href: '/app/calendar', label: '行事曆', icon: 'calendar' },
    { href: '/app/approvals', label: '待審核', icon: 'check', badge: { n: counts.pendingReview.posts, bg: 'var(--warn-soft)', fg: 'var(--warn)' } },
    { href: '/app/assistant', label: 'AI 助理', icon: 'spark' },
    { href: '/app/analytics', label: '成效', icon: 'chart' },
    { href: '/app/channels', label: '市場與帳號', icon: 'link', badge: { n: expired.length, bg: 'var(--err-soft)', fg: 'var(--err)' } },
    { href: '/app/voice', label: '品牌語氣', icon: 'voice' },
  ];

  const sidebar = (
    <aside className="sidebar" aria-label="側欄">
      <div className="brand"><span className="brand-mark">K</span>kdan-social</div>
      <a href="/app/channels" className="workspace" style={{ color: 'inherit' }}>
        <span className="ws-mark">{ws.name.slice(0, 2).toUpperCase()}</span>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>{ws.name}</span>
          <span className="tiny muted">{markets.length} 個市場 · {accounts.length} 個帳號</span>
        </span>
        <Icon name="chevronDown" size={16} />
      </a>
      <a href="/app/posts/new" className="btn btn-primary" style={{ minHeight: 44 }}>
        <Icon name="plus" stroke={2} />新增貼文
      </a>
      <NavLinks items={nav} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="side-section-title">市場</div>
        {markets.map((m) => {
          const bad = expired.some((a) => a.marketId === m.id);
          return (
            <a key={m.id} href={`/app?market=${m.code}`} className="market-link">
              <span className="mk">{m.code}</span>
              <span style={{ flex: 1 }}>{m.name}</span>
              <span className="tiny muted num">{localTime(m.timeZone)}</span>
              <span className="dot" role="img" aria-label={bad ? '有帳號需重新連結' : '正常'} style={{ background: bad ? 'var(--err)' : 'var(--ok)' }} />
            </a>
          );
        })}
      </div>
      <div className="side-foot">
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
        <form action={signOut}>
          <button type="submit" style={{ border: 0, background: 'none', padding: 0, marginTop: 4, color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}>登出</button>
        </form>
      </div>
    </aside>
  );

  return <AppShell sidebar={sidebar}>{children}</AppShell>;
}
