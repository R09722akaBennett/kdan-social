import { clockInZone, dayInZone, formatInZone, listGroups, listTags, tagsForPosts, tasksBetween, weekStart, type ScheduledTask } from '@kdan-social/core';
import { TagPill } from '@/components/tags';
import { FilterMenu } from '@/components/groups';
import { EmptyState, errorText, GroupTag, Icon, Pf, SegLinks, zoneName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';

const WD = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const ST: Record<string, { bar: string; label: string; fg: string; border: string; style: string }> = {
  published: { bar: 'var(--ok)', label: '已發布', fg: 'var(--ok)', border: 'var(--line)', style: 'solid' },
  scheduled: { bar: 'var(--accent)', label: '已排程', fg: 'var(--accent)', border: 'var(--line)', style: 'solid' },
  running: { bar: 'var(--accent)', label: '發送中', fg: 'var(--accent)', border: 'var(--line)', style: 'solid' },
  pending: { bar: 'var(--warn-bar)', label: '待審核', fg: 'var(--warn)', border: '#EBD9A8', style: 'solid' },
  changes: { bar: 'var(--err)', label: '要求修改', fg: 'var(--err)', border: 'var(--err-line)', style: 'solid' },
  failed: { bar: 'var(--err)', label: '失敗', fg: 'var(--err)', border: 'var(--err-line)', style: 'solid' },
  risk: { bar: 'var(--err)', label: '會失敗', fg: 'var(--err)', border: 'var(--err-line)', style: 'solid' },
  needs_check: { bar: 'var(--warn-bar)', label: '需人工確認', fg: 'var(--warn)', border: '#EBD9A8', style: 'solid' },
  missed: { bar: 'var(--warn-bar)', label: '未核准略過', fg: 'var(--warn)', border: '#EBD9A8', style: 'solid' },
  dry_run: { bar: 'transparent', label: 'dry-run', fg: 'var(--ink-3)', border: '#B8BEC7', style: 'dashed' },
  cancelled: { bar: 'transparent', label: '已取消', fg: 'var(--ink-3)', border: '#D5D9DF', style: 'dashed' },
};

/** The calendar state of one task: its own status, refined by review and account health while it waits. */
function stateOf(t: ScheduledTask) {
  if (t.status === 'scheduled' || t.status === 'running') {
    if (t.accountStatus !== 'active') return 'risk';
    if (t.review === 'pending') return 'pending';
    if (t.review === 'changes_requested') return 'changes';
  }
  return t.status;
}

/** Flag a task's icon when it failed, or still waits on an account whose authorization expired. */
const isBad = (t: ScheduledTask) => t.status === 'failed' || ((t.status === 'scheduled' || t.status === 'running') && t.accountStatus !== 'active');

type Card = { key: string; postId: string; groupName: string | null; time: string; local: string | null; title: string; state: string; tasks: ScheduledTask[]; detail: string | null };

/** Group a day's tasks into one card per post and account group, as the prototype shows them. */
function cardsFor(tasks: ScheduledTask[], viewTz: string): Card[] {
  const map = new Map<string, ScheduledTask[]>();
  for (const t of tasks) map.set(`${t.postId}:${t.groupId}`, [...(map.get(`${t.postId}:${t.groupId}`) ?? []), t]);
  const order = ['risk', 'failed', 'changes', 'needs_check', 'missed', 'pending', 'running', 'scheduled', 'published', 'dry_run', 'cancelled'];
  return [...map.values()].map((list) => {
    const t = list[0]!;
    const state = list.map(stateOf).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]!;
    const viewer = clockInZone(t.runAt, viewTz);
    // Each account's own clock, where it differs from the viewer's.
    const local = [...new Set(list.filter((x) => x.timeZone !== viewTz).map((x) => `${formatInZone(x.runAt, x.timeZone)}（${zoneName(x.timeZone)}）`))].join(' · ') || null;
    const err = errorText(list.find((x) => x.lastError)?.lastError ?? null);
    return { key: `${t.postId}:${t.groupId}`, postId: t.postId, groupName: t.groupName, time: viewer, local, title: t.title, state, tasks: list, detail: err };
  });
}

export default async function Calendar({ searchParams }: { searchParams: Promise<{ week?: string; view?: string; group?: string | string[]; tag?: string | string[]; created?: string }> }) {
  const { workspace } = await requireWorkspace();
  const q = await searchParams;
  const week = Number.parseInt(q.week ?? '0', 10) || 0;
  const view = q.view === 'list' ? 'list' : 'week';
  const db = getDb();
  const viewTz = workspace.timeZone;
  const filter = [q.group ?? []].flat();
  const tagFilter = [q.tag ?? []].flat();
  const [groups, tags] = await Promise.all([listGroups(db, workspace.id), listTags(db, workspace.id)]);

  const start = new Date(weekStart(new Date(), viewTz).getTime() + week * 7 * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const tasks = await tasksBetween(db, { workspaceId: workspace.id, from: start, to: end, groupIds: filter.map((g) => (g === 'none' ? null : g)), tagIds: tagFilter.map((t) => (t === 'none' ? null : t)) });
  const postTags = await tagsForPosts(db, tasks.map((t) => t.postId));
  const todayKey = dayInZone(new Date(), viewTz);
  const days = Array.from({ length: 7 }, (_, i) => {
    const at = new Date(start.getTime() + i * 86_400_000);
    const key = dayInZone(at, viewTz);
    const dayTasks = tasks.filter((t) => dayInZone(t.runAt, viewTz) === key);
    return { key, wd: WD[i]!, num: key.split('/')[1], today: key === todayKey, past: at.getTime() + 86_400_000 < Date.now(), cards: cardsFor(dayTasks, viewTz) };
  });
  const href = (p: Partial<{ week: number; view: string }>) => {
    const s = new URLSearchParams();
    const w = p.week ?? week;
    if (w) s.set('week', String(w));
    if ((p.view ?? view) === 'list') s.set('view', 'list');
    for (const g of filter) s.append('group', g);
    for (const t of tagFilter) s.append('tag', t);
    const qs = s.toString();
    return `/app/calendar${qs ? `?${qs}` : ''}`;
  };

  return (
    <main className="main">
      <header className="page-head" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 12 }}>
          <h1>行事曆</h1>
          <div className="row" style={{ gap: 4 }}>
            <a className="btn icon-btn" aria-label="上一週" href={href({ week: week - 1 })} style={{ width: 36, height: 36, minHeight: 36 }}><Icon name="chevronLeft" size={16} stroke={2} /></a>
            <a className="btn btn-sm" href={href({ week: 0 })}>本週</a>
            <a className="btn icon-btn" aria-label="下一週" href={href({ week: week + 1 })} style={{ width: 36, height: 36, minHeight: 36 }}><Icon name="chevronRight" size={16} stroke={2} /></a>
          </div>
          <span style={{ fontWeight: 500 }}>{start.getUTCFullYear()} 年 {days[0]!.key} – {days[6]!.key}</span>
        </div>
        <div className="row">
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} />
          {tags.length > 0 && <FilterMenu label="標籤" param="tag" options={[...tags.map((t) => ({ id: t.id, label: t.name })), { id: 'none', label: '未加標籤' }]} />}
          <SegLinks label="檢視" items={[{ href: href({ view: 'week' }), text: '週', on: view === 'week' }, { href: href({ view: 'list' }), text: '清單', on: view === 'list' }]} />
          <span className="chip" style={{ height: 36, border: '1px solid var(--control)', background: '#fff', fontSize: 13 }}>顯示時區：{zoneName(viewTz)}</span>
        </div>
      </header>

      {q.created && <div className="chip chip-ok" role="status" style={{ height: 'auto', padding: '10px 14px', fontSize: 14 }}>已建立貼文，會在排定的時間由排程發出。</div>}

      <div className="row tiny" style={{ gap: 16, color: 'var(--ink-2)' }}>
        {[['已排程', 'var(--accent)'], ['待審核', 'var(--warn-bar)'], ['已發布', 'var(--ok)'], ['失敗、會失敗或要求修改', 'var(--err)']].map(([l, c]) => (
          <span key={l} className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>
        ))}
        <span className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, border: '1px dashed #8A9099' }} />dry-run（對外發文關閉時）</span>
      </div>

      {tasks.length === 0 ? (
        <section className="card">
          <EmptyState icon="calendar" title={filter.length ? '這週選的群組沒有貼文' : '這週沒有貼文'} action={<a className="btn btn-primary" href="/app/posts/new">新增貼文</a>}>
            排程、已發布和 dry-run 的貼文都會照時間排在這裡。可以用上方的箭頭切到其他週。
          </EmptyState>
        </section>
      ) : view === 'week' ? (
        <div className="card table-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', minWidth: 1000 }}>
            {days.map((d) => (
              <div key={d.key} style={{ borderRight: '1px solid var(--line-soft)', minHeight: 620, background: d.today ? '#F7F9FF' : d.past ? '#FAFBFC' : '#fff' }}>
                <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-soft)', alignItems: 'baseline' }}>
                  <span className="tiny muted">{d.wd}</span>
                  <span className="num" style={{ fontSize: 18, fontWeight: 600, color: d.today ? 'var(--accent)' : 'var(--ink)' }}>{d.num}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 8px' }}>
                  {d.cards.map((c) => {
                    const s = ST[c.state] ?? ST.scheduled!;
                    return (
                      <a key={c.key} href={`/app/posts/${c.postId}`}
                        style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 8, border: `1px ${s.style} ${s.border}`, background: '#fff', boxShadow: `inset 3px 0 0 ${s.bar}`, color: 'var(--ink)' }}>
                        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <span className="tiny num" style={{ fontWeight: 600 }}>{c.time}</span>
                          <GroupTag name={c.groupName} />
                          <span className="spacer" style={{ fontSize: 11, color: s.fg }}>{s.label}</span>
                        </span>
                        {c.local && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.local}</span>}
                        <span className="small" style={{ lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.title}</span>
                        <span className="row" style={{ gap: 4 }}>
                          {c.tasks.map((t) => <Pf key={t.id} pf={t.platform} size="sm" bad={isBad(t)} />)}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          {days.flatMap((d) => d.cards.map((c) => ({ d, c }))).map(({ d, c }) => {
            const s = ST[c.state] ?? ST.scheduled!;
            const fb = c.tasks.find((t) => t.platform === 'facebook' && t.externalPostId);
            const [page, post] = fb?.externalPostId?.split('_') ?? [];
            return (
              <div key={c.key} className="list-row">
                <span className="num" style={{ width: 120, color: 'var(--ink-2)' }}>{d.wd} {d.key} {c.time}</span>
                <GroupTag name={c.groupName} />
                <a href={`/app/posts/${c.postId}`} style={{ flex: '1 1 260px', minWidth: 0, color: 'inherit' }}>{c.title}</a>
                {postTags.get(c.postId) && <span className="tag-row">{postTags.get(c.postId)!.map((t) => <TagPill key={t.id} tag={t} />)}</span>}
                <span className="row" style={{ gap: 4 }}>{c.tasks.map((t) => <Pf key={t.id} pf={t.platform} size="sm" bad={isBad(t)} />)}</span>
                <span className="small" style={{ width: 200, textAlign: 'right', color: s.fg }}>{s.label}{page && post ? <> · <a href={`https://www.facebook.com/${page}/posts/${post}`} target="_blank" rel="noreferrer">看貼文</a></> : null}</span>
                {c.detail && <span className="tiny" style={{ flexBasis: '100%', color: 'var(--ink-2)' }}>{c.detail}</span>}
              </div>
            );
          })}
        </div>
      )}

      <p className="small muted">時間都換算成{zoneName(viewTz)}時間顯示，卡片第二行是該帳號時區的當地時間。三個平台都由我們的排程器在時間到時送出。帳號授權失效時，相關貼文會提前標紅。</p>
    </main>
  );
}
