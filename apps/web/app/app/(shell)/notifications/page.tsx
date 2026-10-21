import { formatInZone, listNotifications, unreadCount } from '@kdan-social/core';
import { EmptyState, Icon, SegLinks, errorText, type IconName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { markAllReadAction, openNotificationAction } from '@/app/app/actions';

const LOOK: Record<string, [IconName, string]> = {
  'publish.failed': ['alert', 'var(--err)'],
  'account.expired': ['alert', 'var(--err)'],
  'publish.needs_check': ['alert', 'var(--warn)'],
  'publish.comment_failed': ['comment', 'var(--warn)'],
  'publish.missed': ['alert', 'var(--warn)'],
  'review.requested': ['check', 'var(--accent)'],
  'review.approved': ['check', 'var(--ok)'],
  'review.changes_requested': ['comment', 'var(--warn)'],
  'post.commented': ['comment', 'var(--ink-2)'],
};

/** Inbox after fal's notification page and Dovetail's panel: unread dot, one line of detail, a "查看" button. */
export default async function Notifications({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { user, workspace } = await requireWorkspace();
  const unreadOnly = (await searchParams).show === 'unread';
  const db = getDb();
  const [items, unread] = await Promise.all([
    listNotifications(db, { workspaceId: workspace.id, userId: user.id, unreadOnly, limit: 100 }),
    unreadCount(db, { workspaceId: workspace.id, userId: user.id }),
  ]);

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>通知</h1>
          <div className="sub">發文失敗、帳號授權失效、送審與審核結果、貼文留言，都會出現在這裡。</div>
        </div>
        <form action={markAllReadAction}><button type="submit" className="btn" disabled={unread === 0}>全部標為已讀</button></form>
      </header>

      <SegLinks label="顯示" items={[
        { href: '/app/notifications', text: '全部', on: !unreadOnly },
        { href: '/app/notifications?show=unread', text: `未讀 ${unread}`, on: unreadOnly },
      ]} />

      <section className="card" aria-label="通知列表">
        {items.length === 0 && (
          <EmptyState icon="bell" title={unreadOnly ? '沒有未讀通知' : '還沒有通知'}>
            {unreadOnly ? '都看過了。' : '有貼文發送失敗、帳號需要重新連結，或有人送審、審核、留言時，會通知你。'}
          </EmptyState>
        )}
        {items.map((n) => {
          const [icon, color] = LOOK[n.kind] ?? ['bell', 'var(--ink-2)'];
          const body = n.kind.startsWith('publish.') ? errorText(n.body) : n.body;
          return (
            <div key={n.id} className="list-row" style={{ alignItems: 'flex-start', background: n.readAt ? undefined : 'var(--accent-wash)' }}>
              <span className="dot" role="img" aria-label={n.readAt ? '已讀' : '未讀'} style={{ marginTop: 8, background: n.readAt ? 'transparent' : 'var(--accent)' }} />
              <span style={{ color, display: 'flex', marginTop: 1 }}><Icon name={icon} size={18} /></span>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                <div style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.title}</div>
                {body && <div className="small" style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{body}</div>}
                <div className="tiny muted" style={{ marginTop: 2 }}>{formatInZone(n.createdAt, workspace.timeZone)}</div>
              </div>
              {n.href && (
                <form action={openNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="btn btn-sm">查看</button>
                </form>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
