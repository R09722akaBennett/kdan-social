import {
  clockInZone,
  dayInZone,
  followerStats,
  globalPublishingEnabled,
  listAccounts,
  listGroups,
  overviewCounts,
  publishingAllowed,
  upcomingTasks,
  type ScheduledTask,
} from '@kdan-social/core';
import type { CSSProperties } from 'react';
import { FilterMenu } from '@/components/groups';
import { Chip, Icon, localTime, Pf, PLATFORM, fmtN, zoneName } from '@/components/ui';
import { currentMember } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { signOut, togglePublishing } from '@/app/app/actions';

const NOTICE: Record<string, [string, string]> = {
  connected: ['ok', '已連結 {n} 個帳號。'],
  line_connected: ['ok', '已連結 LINE 官方帳號「{n}」。'],
  test_queued: ['ok', '已排入一則測試貼文，一分鐘內會被處理成 dry-run，可到行事曆查看結果。'],
  test_refused: ['err', '對外發文已開啟，測試貼文會真的發出去，所以沒有排入。'],
  meta_cancelled: ['warn', '你在 Facebook 取消了授權，沒有連結任何帳號。'],
  meta_state: ['err', '授權驗證失敗（可能是連結過期或被竄改），請重新連結。'],
  meta_no_pages: ['warn', 'Facebook 沒有回傳任何粉專。請確認你是粉專管理員，並在授權畫面勾選了粉專。'],
  meta_denied: ['err', 'Facebook 拒絕了授權，請重新連結並允許所有要求的權限。'],
  meta_failed: ['err', '和 Facebook 連線失敗，請稍後再試。'],
  meta_expired: ['err', '這次授權已過期（15 分鐘），請重新連結。'],
  publishing_on: ['warn', '已開啟對外發文：之後到時間的貼文會真的發出。'],
  publishing_off: ['ok', '已關閉對外發文：之後到時間的貼文只會記錄為 dry-run。'],
  confirm_needed: ['err', '開啟前請先勾選確認。'],
  owner_only: ['err', '只有工作區擁有者可以切換對外發文。'],
};

const reconnectHref = (platform: string) => (platform === 'line' ? '/app/connect/line' : '/api/meta/connect');
const SHORT = { facebook: 'FB', instagram: 'IG', line: 'LINE' } as const;
const SEVERITY = ['err', 'warn', 'plan'];

function taskChip(t: ScheduledTask): ['plan' | 'warn' | 'err', string] {
  if (t.accountStatus !== 'active') return ['err', `${SHORT[t.platform]} 會失敗`];
  if (t.review === 'pending') return ['warn', '待審核'];
  if (t.review === 'changes_requested') return ['err', '要求修改'];
  return ['plan', '已排程'];
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ group?: string | string[]; notice?: string; n?: string }> }) {
  const { user, membership } = await currentMember();
  const sp = await searchParams;
  const { notice, n } = sp;
  const filter = [sp.group ?? []].flat();

  if (!membership) {
    return (
      <main className="main" style={{ maxWidth: 560, margin: '64px auto' }}>
        <h1>尚未加入任何工作區</h1>
        <p>你以 <strong>{user.email}</strong> 登入，但還沒有被加入工作區。請聯絡管理員把你加進去。</p>
        <form action={signOut}><button className="btn" type="submit">登出</button></form>
      </main>
    );
  }

  const db = getDb();
  const { workspace, role } = membership;
  const groupIds = filter.map((g) => (g === 'none' ? null : g));
  const [groups, accounts, followers, counts, upcoming] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    followerStats(db, workspace.id),
    overviewCounts(db, { workspaceId: workspace.id, groupIds, timeZone: workspace.timeZone }),
    upcomingTasks(db, { workspaceId: workspace.id, groupIds, limit: 30 }),
  ]);
  const inFilter = (groupId: string | null) => filter.length === 0 || filter.includes(groupId ?? 'none');
  const shownAccounts = accounts.filter((a) => inFilter(a.groupId));
  // Ungrouped accounts get a card of their own, after the customer's groups.
  const cards = [...groups.map((g) => ({ id: g.id as string | null, name: g.name })), { id: null, name: '未分組' }]
    .filter((g) => inFilter(g.id) && accounts.some((a) => a.groupId === g.id));
  const tz = workspace.timeZone;
  const expired = shownAccounts.filter((a) => a.status !== 'active');
  const withCounts = shownAccounts.filter((a) => followers.has(a.id));
  const total = withCounts.reduce((s, a) => s + followers.get(a.id)!.followers, 0);
  const deltas = withCounts.map((a) => followers.get(a.id)!.delta7).filter((d): d is number => d !== null);
  const delta = deltas.reduce((s, d) => s + d, 0);
  const live = publishingAllowed(globalPublishingEnabled(), workspace);
  const note = notice ? NOTICE[notice] : undefined;
  const today = new Intl.DateTimeFormat('zh-TW', { timeZone: tz, month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

  // One row per post, with its accounts and the most urgent state among them.
  const byPost = new Map<string, ScheduledTask[]>();
  for (const t of upcoming) byPost.set(t.postId, [...(byPost.get(t.postId) ?? []), t]);
  const rows = [...byPost.values()].slice(0, 6);

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>總覽</h1>
          <div className="sub">{workspace.name} · {today} · 以{zoneName(tz)}時間顯示</div>
        </div>
        <div className="row">
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} />
          <a href="/app/posts/new" className="btn btn-primary">新增貼文</a>
        </div>
      </header>

      {note && <div className={`chip chip-${note[0]}`} role="status" style={{ height: 'auto', padding: '10px 14px', fontSize: 14 }}>{note[1].replace('{n}', n ?? '0')}</div>}

      {expired[0] && (
        <section className="alert" aria-label="需要處理">
          <span style={{ color: 'var(--err)', display: 'flex' }}><Icon name="alert" size={20} stroke={2} /></span>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <div className="title">{PLATFORM[expired[0].platform].name}「{expired[0].name}」的授權已失效{expired.length > 1 ? `（另有 ${expired.length - 1} 個帳號）` : ''}</div>
            <div className="body">這些帳號排定的貼文會發不出去。重新連結後，貼文會照原時間發布。</div>
          </div>
          <a className="btn btn-danger" href={reconnectHref(expired[0].platform)}>重新連結</a>
        </section>
      )}

      <section className="card card-pad row" style={{ gap: '10px 16px', borderColor: live ? 'var(--err-line)' : 'var(--line)' }} aria-label="對外發文">
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontWeight: 600 }}>對外發文：{live ? '開啟，到時間的貼文會真的發出' : '關閉，到時間的貼文只記錄為 dry-run'}</div>
          <div className="small muted">工作區開關：{workspace.publishingEnabled ? '開' : '關'} · 系統總開關：{globalPublishingEnabled() ? '開' : '關（由系統管理員控制）'}。兩個都開才會真的發文。</div>
        </div>
        {role === 'owner' && (
          <form action={togglePublishing} className="row">
            <input type="hidden" name="enable" value={workspace.publishingEnabled ? '0' : '1'} />
            {!workspace.publishingEnabled && <label className="row small" style={{ cursor: 'pointer' }}><input type="checkbox" name="confirm" style={{ accentColor: 'var(--err)' }} />我了解開啟後貼文會真的發到粉專</label>}
            <button className={`btn ${workspace.publishingEnabled ? '' : 'btn-danger'}`} type="submit">{workspace.publishingEnabled ? '關閉工作區發文' : '開啟工作區發文'}</button>
          </form>
        )}
      </section>

      <section className="grid" style={{ '--min': '200px' } as CSSProperties} aria-label="數字">
        <a href="/app/analytics" className="card stat">
          <span className="small muted">總粉絲數（{shownAccounts.length} 個帳號）</span>
          <span className="value">{withCounts.length ? fmtN(total) : '—'}</span>
          <span className="small" style={{ color: deltas.length ? 'var(--ok)' : 'var(--ink-3)' }}>
            {!withCounts.length ? '每天 00:30 更新，明天起會有數字' : deltas.length ? `${delta >= 0 ? '+' : ''}${fmtN(delta)} 近 7 天` : '累積滿 7 天後會顯示變化'}
          </span>
        </a>
        <a href="/app/calendar" className="card stat">
          <span className="small muted">本週已發布</span>
          <span className="value">{counts.published.posts} 篇</span>
          <span className="small muted">共 {counts.published.tasks} 個發文任務</span>
        </a>
        <a href="/app/approvals" className="card stat">
          <span className="small muted">待審核</span>
          <span className="value">{counts.pendingReview.posts} 篇</span>
          <span className="small" style={{ color: counts.pendingReview.posts ? 'var(--warn)' : 'var(--ink-3)' }}>{counts.pendingReview.posts ? '等擁有者或管理員核准' : '沒有待審貼文'}</span>
        </a>
        <a href="/app/calendar" className="card stat">
          <span className="small muted">發布失敗</span>
          <span className="value">{counts.failed.tasks} 個任務</span>
          <span className="small" style={{ color: counts.failed.tasks ? 'var(--err)' : 'var(--ink-3)' }}>{counts.failed.tasks ? '近 7 天，看原因與重試' : '近 7 天沒有失敗'}</span>
        </a>
      </section>

      <section className="stack" aria-labelledby="h-groups">
        <h2 id="h-groups">各群組</h2>
        {cards.length === 0 && <div className="card card-pad small muted">還沒有連結帳號。<a href="/app/channels">去連結</a></div>}
        <div className="grid" style={{ '--min': '300px' } as CSSProperties}>
          {cards.map((g) => {
            const list = accounts.filter((a) => a.groupId === g.id);
            const zones = [...new Set(list.map((a) => a.timeZone))];
            return (
              <div key={g.id ?? 'none'} className="card">
                <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-soft)', gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>{g.name}</span>
                  <span className="spacer tiny muted num">{zones.map((z) => `${zoneName(z)} ${localTime(z)}`).join(' · ')}</span>
                </div>
                {list.map((a) => {
                  const f = followers.get(a.id);
                  const bad = a.status !== 'active';
                  const tag = bad ? '授權失效' : f?.delta7 != null ? `${f.delta7 >= 0 ? '+' : ''}${fmtN(f.delta7)}` : '';
                  return (
                    <div key={a.id} className="row" style={{ padding: '10px 16px', gap: 10, flexWrap: 'nowrap' }}>
                      <Pf pf={a.platform} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span className="num" style={{ fontWeight: 500 }}>{f ? fmtN(f.followers) : '—'}</span>
                      <span className="tiny" style={{ width: 64, textAlign: 'right', color: bad ? 'var(--err)' : 'var(--ok)' }}>{tag}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>即將發布</h2>
          <a href="/app/calendar" className="small">看行事曆</a>
        </div>
        {rows.length === 0 && <div className="list-row small muted">沒有排程中的貼文。<a href="/app/posts/new">新增貼文</a></div>}
        {rows.map((tasks) => {
          const first = tasks[0]!;
          const [tone, label] = tasks.map(taskChip).sort((a, b) => SEVERITY.indexOf(a[0]) - SEVERITY.indexOf(b[0]))[0]!;
          const spread = new Set(tasks.map((t) => t.runAt.getTime())).size > 1;
          return (
            <div key={first.postId} className="list-row">
              <div style={{ width: 96, display: 'flex', flexDirection: 'column' }}>
                <span className="num" style={{ fontWeight: 600 }}>{clockInZone(first.runAt, tz)}</span>
                <span className="tiny muted">{dayInZone(first.runAt, tz)}</span>
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div>{first.title}</div>
                <div className="row" style={{ gap: 4, marginTop: 4 }}>
                  {tasks.map((t) => <Pf key={t.id} pf={t.platform} size="sm" bad={t.accountStatus !== 'active'} />)}
                  <span className="tiny muted">{tasks.length} 個帳號{spread ? ' · 依各帳號時區，從這個時間開始' : ''}</span>
                </div>
              </div>
              <a href={tone === 'warn' ? '/app/approvals' : '/app/calendar'} style={{ color: 'inherit' }}>
                <Chip tone={tone}>{label}</Chip>
              </a>
            </div>
          );
        })}
      </section>
    </main>
  );
}
