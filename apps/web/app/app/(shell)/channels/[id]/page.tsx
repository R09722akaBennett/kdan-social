import { bestHour, channelAccount, channelCounts, channelItems, clockInZone, dayInZone, listGroups, listTags, postingSlots, publishedThisWeek, tagsForPosts, type ChannelItem, type ChannelTab, type Slot } from '@kdan-social/core';
import { GoalDialog } from '@/components/goal-dialog';
import { setGoalAction } from '@/app/app/actions';
import { FilterMenu } from '@/components/groups';
import { TagPill } from '@/components/tags';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformMark } from '@/components/brand-icons';
import { ChannelWelcome } from '@/components/channel-welcome';
import { NoticeToast } from '@/components/toast';
import { Chip, commentErrorText, EmptyState, Icon, localTime, PLATFORM, zoneName } from '@/components/ui';
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
export default async function Channel({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; view?: string; tag?: string | string[]; notice?: string; error?: string }> }) {
  const [{ id }, sp, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const db = getDb();
  const account = await channelAccount(db, { workspaceId: workspace.id, accountId: id });
  if (!account) notFound();
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : 'queue') as ChannelTab;
  // Only Instagram shows posts as a grid, so only its page offers the view.
  const grid = account.platform === 'instagram' && sp.view === 'grid';
  const tagIds = [sp.tag ?? []].flat().map((t) => (t === 'none' ? null : t));
  const [counts, items, groups, gridItems, tags] = await Promise.all([
    channelCounts(db, { workspaceId: workspace.id, accountId: id }),
    channelItems(db, { workspaceId: workspace.id, accountId: id, tab, tagIds }),
    listGroups(db, workspace.id),
    grid ? Promise.all((['queue', 'approvals', 'sent'] as const).map((t) => channelItems(db, { workspaceId: workspace.id, accountId: id, tab: t }))) : null,
    listTags(db, workspace.id),
  ]);
  const postTags = await tagsForPosts(db, items.map((i) => i.postId));
  const goal = account.postingGoal;
  // Open slots go into the queue only, around what is already scheduled or waiting for review.
  const [best, sentWeek, inReview] = await Promise.all([
    goal ? bestHour(db, { accountId: id, timeZone: account.timeZone, platform: account.platform }) : null,
    goal ? publishedThisWeek(db, { accountId: id, timeZone: account.timeZone }) : 0,
    goal && tab === 'queue' ? channelItems(db, { workspaceId: workspace.id, accountId: id, tab: 'approvals' }) : [],
  ]);
  const slots: Slot[] = goal && best && tab === 'queue' && !tagIds.length
    ? postingSlots({ goal, hour: best.hour, timeZone: account.timeZone, now: new Date(), scheduled: [...items, ...inReview].map((i) => i.runAt!).filter(Boolean) })
    : [];
  // Switching tabs keeps the tag filter.
  const tagQs = [sp.tag ?? []].flat().map((t) => `&tag=${encodeURIComponent(t)}`).join('');
  // The feed as it will look: the latest scheduled post top left, then back through what went out.
  const [queued = [], waiting = [], sent = []] = gridItems ?? [];
  const feed = [...[...queued, ...waiting].sort((x, y) => (y.runAt?.getTime() ?? 0) - (x.runAt?.getTime() ?? 0)), ...sent];
  const tz = account.timeZone;
  const group = groups.find((g) => g.id === account.groupId)?.name;
  const now = new Date();

  // Drafts have no time, so they sit under one heading; the rest group by day, with the
  // queue's open slots between its posts, as Buffer's queue lists them.
  type Entry = { kind: 'item'; item: ChannelItem; at: number } | { kind: 'slot'; slot: Slot; at: number };
  const entries: Entry[] = [
    ...items.map((item) => ({ kind: 'item' as const, item, at: item.runAt?.getTime() ?? 0 })),
    ...slots.map((slot) => ({ kind: 'slot' as const, slot, at: slot.at.getTime() })),
  ];
  if (tab === 'queue') entries.sort((x, y) => x.at - y.at);
  const days: Array<[string, Entry[]]> = [];
  for (const e of entries) {
    const at = e.kind === 'slot' ? e.slot.at : e.item.runAt;
    const head = at ? dayHeading(at, tz, now) : '未排程';
    const last = days[days.length - 1];
    if (last && last[0] === head) last[1].push(e);
    else days.push([head, [e]]);
  }
  const empty = EMPTY[tab];

  return (
    <main className="main">
      {sp.notice && <NoticeToast text={sp.notice} />}
      {sp.error && <NoticeToast text={sp.error} tone="err" />}
      <header className="page-head">
        <div className="row" style={{ gap: 12, flexWrap: 'nowrap', minWidth: 0 }}>
          <span className="channel-avatar"><PlatformMark pf={account.platform} size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="small"><Link href="/app/channels">帳號與群組</Link> / {PLATFORM[account.platform].name}</div>
            <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</h1>
            <div className="sub row" style={{ gap: 6 }}>
              <span>{group ? `${group} · ` : ''}{zoneName(tz)} {localTime(tz)}{account.status !== 'active' ? ' · 授權已失效' : ''}</span>
              <span aria-hidden="true">·</span>
              {/* After Buffer's "1/5 posts sent this week" under the channel name. */}
              <GoalDialog action={setGoalAction} accountId={account.id} current={goal} className="link-btn small">
                {goal ? `本週已發布 ${sentWeek} / ${goal} 篇` : '設定發文目標'}
              </GoalDialog>
            </div>
          </div>
        </div>
        <div className="row">
          {account.platform === 'instagram' && (
            <div className="seg" role="group" aria-label="顯示方式">
              <Link href={`/app/channels/${account.id}?tab=${tab}`} aria-pressed={!grid}>清單</Link>
              <Link href={`/app/channels/${account.id}?view=grid`} aria-pressed={grid}>格狀</Link>
            </div>
          )}
          {/* After Buffer's per-channel Insights: the same numbers page, scoped to this account. */}
          <Link href={`/app/analytics?account=${account.id}`} className="btn"><Icon name="chart" size={16} />看成效</Link>
          <Link href={`/app/posts/new?account=${account.id}`} className="btn btn-primary"><Icon name="plus" size={16} stroke={2} />新增貼文</Link>
        </div>
      </header>

      {grid && (
        <section aria-label="格狀預覽" className="stack" style={{ gap: 10 }}>
          <div className="small muted">照 Instagram 個人檔案的排法：最晚排定的在左上，接著是已經發出的。半透明的是還沒發的貼文。</div>
          {feed.length === 0 ? (
            <div className="card"><EmptyState icon="calendar" title="還沒有貼文可以預覽" action={<Link href={`/app/posts/new?account=${account.id}`} className="btn btn-sm">新增貼文</Link>}>排程或發出的 IG 貼文會照順序排在這裡。</EmptyState></div>
          ) : (
            <div className="ig-grid">
              {feed.map((item) => {
                const img = item.media[0];
                const upcoming = item.status === 'scheduled' || item.status === 'running';
                return (
                  <Link key={item.postId} href={`/app/posts/${item.postId}`} className="ig-cell" data-upcoming={upcoming} aria-label={`${item.title}${upcoming && item.runAt ? `，${dayInZone(item.runAt, tz)} ${clockInZone(item.runAt, tz)} 發出` : ''}`}>
                    {img ? <img src={img.previewUrl ?? img.url} alt={img.alt ?? ''} /> : <span className="ig-cell-text">{item.body.slice(0, 80)}</span>}
                    {upcoming && item.runAt && <span className="ig-cell-when">{dayInZone(item.runAt, tz)} {clockInZone(item.runAt, tz)}</span>}
                    {item.media.length > 1 && <span className="ig-cell-many" aria-hidden="true">{item.media.length}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!grid && <>
      <nav className="channel-tabs" aria-label="貼文分類">
        {TABS.map((t) => (
          <Link key={t.key} href={`/app/channels/${account.id}?tab=${t.key}${tagQs}`} aria-current={t.key === tab ? 'page' : undefined}>
            {t.label}<span className="channel-count num">{counts[t.key]}</span>
          </Link>
        ))}
        {tags.length > 0 && <span style={{ marginLeft: 'auto', alignSelf: 'center' }}><FilterMenu label="標籤" param="tag" options={[...tags.map((t) => ({ id: t.id, label: t.name })), { id: 'none', label: '未加標籤' }]} /></span>}
      </nav>

      {tab === 'queue' && <ChannelWelcome />}
      {slots.length > 0 && best && (
        <div className="small muted">
          虛線是照每週 {goal} 篇目標留的空時段，
          {best.source === 'history'
            ? `時間取自這個帳號過去 ${best.posts} 篇貼文裡互動最好的 ${String(best.hour).padStart(2, '0')}:00。`
            : `目前用預設的 ${String(best.hour).padStart(2, '0')}:00；累積 10 篇有數字的貼文後，會改用這個帳號互動最好的時段。`}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card">
          <EmptyState icon={empty.icon} title={empty.title} action={<Link href={`/app/posts/new?account=${account.id}`} className="btn btn-sm">新增貼文</Link>}>{empty.body}</EmptyState>
        </div>
      ) : (
        <div className="stack channel-days">
          {tab === 'sent' && counts.sent > items.length && <div className="small muted">顯示最新 {items.length} 篇，共 {counts.sent} 篇。</div>}
          {days.map(([head, list]) => (
            <section key={head} className="stack" style={{ gap: 10 }} aria-label={head}>
              <h2 className="channel-day">{head}</h2>
              {list.map((e) => {
                if (e.kind === 'slot') {
                  return (
                    <article key={`slot-${e.at}`} className="channel-item">
                      <div className="channel-when"><span className="num" style={{ fontWeight: 600 }}>{e.slot.time}</span></div>
                      <Link href={`/app/posts/new?account=${account.id}&date=${e.slot.date}&time=${e.slot.time}`} className="slot-row channel-card">
                        <Icon name="plus" size={16} />新增貼文到這個時段
                      </Link>
                    </article>
                  );
                }
                const item = e.item;
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
                        {postTags.get(item.postId) && <span className="tag-row channel-tags">{postTags.get(item.postId)!.map((t) => <TagPill key={t.id} tag={t} />)}</span>}
                        <p className="channel-text">{item.body || <span className="muted">（沒有文字）</span>}</p>
                        {item.media[0] && (
                          <img className="channel-thumb" src={item.media[0].previewUrl ?? item.media[0].url} alt={item.media[0].alt ?? ''} />
                        )}
                      </div>
                      {item.status === 'failed' && item.lastError && <div className="small channel-error">{item.lastError}</div>}
                      {item.commentError && <div className="small channel-error channel-warn">{commentErrorText(item.commentError)}</div>}
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
      </>}
    </main>
  );
}
