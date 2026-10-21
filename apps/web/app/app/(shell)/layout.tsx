import { listAccounts, listGroups, listMemberships, overviewCounts, unreadCount } from '@kdan-social/core';
import type { ReactNode } from 'react';
import { AppShell, NavLinks, type NavItem } from '@/components/AppShell';
import { Icon } from '@/components/ui';
import { currentMember } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { signOut, switchWorkspaceAction } from '@/app/app/actions';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { PlatformMark } from '@/components/brand-icons';
import { ConnectProgress } from '@/components/connect-progress';
import { ConnectDialog } from '@/components/connect-dialog';
import Link from 'next/link';

const PLATFORMS = [
  { pf: 'facebook', label: 'Facebook 粉專' },
  { pf: 'instagram', label: 'Instagram' },
  { pf: 'line', label: 'LINE 官方帳號' },
] as const;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await currentMember();
  if (!membership) return <>{children}</>;

  const db = getDb();
  const ws = membership.workspace;
  const [groups, accounts, counts, unread, workspaces] = await Promise.all([listGroups(db, ws.id), listAccounts(db, ws.id), overviewCounts(db, { workspaceId: ws.id }), unreadCount(db, { workspaceId: ws.id, userId: user.id }), listMemberships(db, user.id)]);
  const expired = accounts.filter((a) => a.status !== 'active');
  const missing = PLATFORMS.filter((p) => !accounts.some((a) => a.platform === p.pf));
  const nav: NavItem[] = [
    { href: '/app', label: '總覽', icon: 'home' },
    { href: '/app/notifications', label: '通知', icon: 'bell', badge: { n: unread, bg: 'var(--accent-soft)', fg: 'var(--accent)' } },
    { href: '/app/calendar', label: '行事曆', icon: 'calendar' },
    { href: '/app/approvals', label: '待審核', icon: 'check', badge: { n: counts.pendingReview.posts, bg: 'var(--warn-soft)', fg: 'var(--warn)' } },
    { href: '/app/assistant', label: 'AI 助理', icon: 'spark' },
    { href: '/app/analytics', label: '成效', icon: 'chart' },
    { href: '/app/channels', label: '帳號與群組', icon: 'link', badge: { n: expired.length, bg: 'var(--err-soft)', fg: 'var(--err)' } },
    { href: '/app/voice', label: '品牌語氣', icon: 'voice' },
    { href: '/app/members', label: '成員', icon: 'users' },
    { href: '/app/settings', label: '設定', icon: 'settings' },
  ];

  const sidebar = (
    <aside className="sidebar" aria-label="側欄">
      <div className="brand"><span className="brand-mark">K</span>kdan-social</div>
      <WorkspaceSwitcher
        current={{ id: ws.id, name: ws.name, role: membership.role }}
        detail={`${accounts.length} 個帳號 · ${groups.length} 個群組`}
        list={workspaces}
        action={switchWorkspaceAction}
      />
      <Link href="/app/posts/new" className="btn btn-primary" style={{ minHeight: 44 }}>
        <Icon name="plus" stroke={2} />新增貼文
      </Link>
      <NavLinks items={nav} />
      {missing.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="side-section-title">連結帳號</div>
          {missing.map((p) => (
            <ConnectDialog key={p.pf} start={p.pf} className="market-link side-connect">
              <PlatformMark pf={p.pf} size={18} />
              <span style={{ flex: 1 }}>{p.label}</span>
              <Icon name="plus" size={14} />
            </ConnectDialog>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="side-section-title">群組</div>
        {groups.map((g) => {
          const list = accounts.filter((a) => a.groupId === g.id);
          const bad = list.some((a) => a.status !== 'active');
          return (
            <Link key={g.id} href="/app/channels" className="market-link">
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              <span className="tiny muted num">{list.length}</span>
              <span className="dot" role="img" aria-label={bad ? '有帳號需重新連結' : '正常'} style={{ background: bad ? 'var(--err)' : 'var(--ok)' }} />
            </Link>
          );
        })}
        <Link href="/app/channels#groups" className="market-link" style={{ color: 'var(--ink-3)' }}>
          <Icon name="plus" size={14} /><span className="small">新增群組</span>
        </Link>
      </div>
      <ConnectProgress done={PLATFORMS.length - missing.length} total={PLATFORMS.length} />
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
