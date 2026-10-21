import { channelAccount, channelCounts, channelItems, clockInZone, dayInZone, listGroups, type ChannelItem, type ChannelTab } from '@kdan-social/core';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformMark } from '@/components/brand-icons';
import { ChannelWelcome } from '@/components/channel-welcome';
import { NoticeToast } from '@/components/toast';
import { Chip, EmptyState, Icon, localTime, PLATFORM, zoneName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';

const TABS: Array<{ key: ChannelTab; label: string }> = [
  { key: 'queue', label: '排程' },
  { key: 'drafts', label: '草稿' },
  { key: 'approvals', label: '待審核' },
  { key: 'sent', label: '已發送' },
];

// After Buffer's empty tabs: say what the tab is for, and offer the next step.
const EMPTY: Record<ChannelTab, { icon: 'calendar' | 'edit' | 'check' | 'send'; title: string; body: string }> = {
  queue: { icon: 'calendar', title: '還沒有排程中的貼文', body: '排好時間、核准過的貼文會照這個帳號的時區列在這裡。' },
  drafts: { icon: 'edit', title: '沒有草稿', body: '在編輯器按「存成草稿」，還沒決定時間的貼文會留在這裡。' },
  approvals: { icon: 'check', title: '沒有等待審核的貼文', body: '編輯送出的貼文，在擁有者或管理員核准前會列在這裡。' },
  sent: { icon: 'send', title: '還沒有發送紀錄', body: '發出、dry-run 或失敗的貼文會列在這裡，最新的在最上面。' },
};

const STATUS: Partial<Record<ChannelItem['status'], ['ok' | 'plan' | 'warn' | 'err' | 'neutral', string]>> = {
  scheduled: ['plan', '已排程'],
  running: ['plan', '發送中'],
  published: ['ok', '已發布'],
  dry_run: ['neutral', 'dry-run'],
  failed: ['err', '發布失敗'],
  needs_check: ['warn', '待確認'],
  missed: ['warn', '錯過時間'],
  draft: ['neutral', '草稿'],
};

/** "今天" / "明天" / "10月23日 週五", on the account's clock. */
function dayHeading(at: Date, timeZone: string, now: Date) {
  const day = dayInZone(at, timeZone);
  if (day === dayInZone(now, timeZone)) return `今天，${new Intl.DateTimeFormat('zh-TW', { timeZone, month: 'long', day: 'numeric' }).format(at)}`;
  if (day === dayInZone(new Date(now.getTime() + 86_400_000), timeZone)) return `明天，${new Intl.DateTimeFormat('zh-TW', { timeZone, month: 'long', day: 'numeric' }).format(at)}`;
  return new Intl.DateTimeFormat('zh-TW', { timeZone, month: 'long', day: 'numeric', weekday: 'short' }).format(at);
}

/**
 * One account's posts, after Buffer's channel view: tabs for what is scheduled, drafted,
 * waiting for review and sent, each listed by day on the account's own clock.
 */
export default async function Channel({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; notice?: string }> }) {
  const [{ id }, sp, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const db = getDb();
  const account = await channelAccount(db, { workspaceId: workspace.id, accountId: id });
  if (!account) notFound();
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : 'queue') as ChannelTab;
  const [counts, items, groups] = await Promise.all([
    channelCounts(db, { workspaceId: workspace.id, accountId: id }),
    channelItems(db, { workspaceId: workspace.id, accountId: id, tab }),
    listGroups(db, workspace.id),
  ]);
  const tz = account.timeZone;
  const group = groups.find((g) => g.id === account.groupId)?.name;
  const now = new Date();

  // Drafts have no time, so they sit under one heading; the rest group by day.
  const days: Array<[string, ChannelItem[]]> = [];
  for (const item of items) {
    const head = item.runAt ? dayHeading(item.runAt, tz, now) : '未排程';
    const last = days[days.length - 1];
    if (last && last[0] === head) last[1].push(item);
    else days.push([head, [item]]);
  }
  const empty = EMPTY[tab];

  return (
    <main className="main">
      {sp.notice && <NoticeToast text={sp.notice} />}
      <header className="page-head">
        <div className="row" style={{ gap: 12, flexWrap: 'nowrap', minWidth: 0 }}>
          <span className="channel-avatar"><PlatformMark pf={account.platform} size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="small"><Link href="/app/channels">帳號與群組</Link> / {PLATFORM[account.platform].name}</div>
            <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</h1>
            <div className="sub">{group ? `${group} · ` : ''}{zoneName(tz)} {localTime(tz)}{account.status !== 'active' ? ' · 授權已失效' : ''}</div>
          </div>
        </div>
        <Link href={`/app/posts/new?account=${account.id}`} className="btn btn-primary"><Icon name="plus" size={16} stroke={2} />新增貼文</Link>
      </header>

      <nav className="channel-tabs" aria-label="貼文分類">
        {TABS.map((t) => (
          <Link key={t.key} href={`/app/channels/${account.id}?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>
            {t.label}<span className="channel-count num">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>

      {tab === 'queue' && <ChannelWelcome />}

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={empty.icon} title={empty.title} action={<Link href={`/app/posts/new?account=${account.id}`} className="btn btn-sm">新增貼文</Link>}>{empty.body}</EmptyState>
        </div>
      ) : (
        <div className="stack channel-days">
          {tab === 'sent' && counts.sent > items.length && <div className="small muted">顯示最新 {items.length} 篇，共 {counts.sent} 篇。</div>}
          {days.map(([head, list]) => (
            <section key={head} className="stack" style={{ gap: 10 }} aria-label={head}>
              <h2 className="channel-day">{head}</h2>
              {list.map((item) => {
                const [tone, label] = item.review === 'changes_requested' ? ['err', '要求修改'] as const
                  : item.review === 'pending' ? ['warn', '待審核'] as const
                  : STATUS[item.status] ?? ['neutral', item.status];
                const href = item.status === 'draft' ? `/app/posts/new?draft=${item.postId}` : `/app/posts/${item.postId}`;
                return (
                  <article key={item.postId} className="channel-item">
                    <div className="channel-when">
                      <span className="num" style={{ fontWeight: 600 }}>{item.runAt ? clockInZone(item.runAt, tz) : '未定'}</span>
                      <Chip tone={tone}>{label}</Chip>
                    </div>
                    <div className="card channel-card">
                      <div className="channel-card-body">
                        <p className="channel-text">{item.body || <span className="muted">（沒有文字）</span>}</p>
                        {item.media[0] && (
                          <img className="channel-thumb" src={item.media[0].previewUrl ?? item.media[0].url} alt={item.media[0].alt ?? ''} />
                        )}
                      </div>
                      {item.status === 'failed' && item.lastError && <div className="small channel-error">{item.lastError}</div>}
                      <div className="row channel-card-foot">
                        <span className="tiny muted" style={{ flex: 1, minWidth: 0 }}>{item.createdBy ? `${item.createdBy} 建立` : ''}{item.media.length > 1 ? ` · ${item.media.length} 張圖片` : ''}</span>
                        <Link href={href} className="btn btn-sm">{item.status === 'draft' ? '繼續編輯' : '查看'}</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
