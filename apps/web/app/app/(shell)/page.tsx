import {
  clockInZone,
  dayInZone,
  followerStats,
  globalPublishingEnabled,
  listAccounts,
  listGroups,
  setupProgress,
  overviewCounts,
  publishingAllowed,
  upcomingTasks,
  type ScheduledTask,
} from '@kdan-social/core';
import type { CSSProperties } from 'react';
import { FilterMenu } from '@/components/groups';
import { Chip, Icon, localTime, Pf, PLATFORM, fmtN, zoneName, zoneOptions } from '@/components/ui';
import { currentMember } from '@/lib/auth';
import { createWorkspaceAction, dismissOnboardingAction, signOut } from '@/app/app/actions';
import { getDb, signupCodes } from '@/lib/server';

const NOTICE: Record<string, [string, string]> = {
  workspace_created: ['ok', '工作區建好了，照下面的清單一步步設定。'],
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

export default async function Overview({ searchParams }: { searchParams: Promise<{ group?: string | string[]; notice?: string; n?: string; error?: string }> }) {
  const { user, membership } = await currentMember();
  const sp = await searchParams;
  const { notice, n } = sp;
  const filter = [sp.group ?? []].flat();

  if (!membership) {
    const canCreate = signupCodes().length > 0;
    // After Base44's "Create a Workspace": one card, then what happens next.
    return (
      <main className="main" style={{ maxWidth: 560, margin: '48px auto' }}>
        <header>
          <h1>建立工作區</h1>
          <div className="sub">你以 {user.email} 登入。工作區是一個品牌的所有帳號、貼文與成員所在的地方。</div>
        </header>
        {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}
        {canCreate ? (
          <form action={createWorkspaceAction} className="card card-pad stack" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="ws-name">工作區名稱</label>
              <input id="ws-name" name="name" className="input" required maxLength={60} placeholder="例如：品牌或公司名稱" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="ws-tz">時區</label>
              <select id="ws-tz" name="timeZone" className="select" defaultValue="Asia/Taipei">
                {zoneOptions().map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
              <span className="tiny muted">頁面上的時間以這個時區顯示，新連結的帳號也先用它；之後每個帳號可以各自調整。</span>
            </div>
            <div className="field">
              <label htmlFor="ws-code">邀請碼</label>
              <input id="ws-code" name="code" className="input" required autoComplete="off" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">建立工作區</button>
            </div>
          </form>
        ) : (
          <div className="card card-pad small">目前需要被邀請才能使用。請工作區的擁有者或管理員到「成員」頁邀請 {user.email}，再重新登入。</div>
        )}
        <div className="card card-pad small stack" style={{ gap: 4, background: 'var(--ok-soft)', border: 0 }}>
          <strong style={{ fontWeight: 600 }}>接下來</strong>
          <span>· 你會是這個工作區的擁有者，可以邀請成員、管理所有設定</span>
          <span>· 總覽頁會有一份設定清單，帶你連結帳號、送測試貼文</span>
          <span>· 對外發文預設關閉，確認沒問題後再到設定開啟</span>
          {!canCreate && <span>· 被邀請的話，用受邀的 email 登入就會自動加入</span>}
        </div>
        <form action={signOut}><button className="btn btn-sm" type="submit">登出</button></form>
      </main>
    );
  }

  const db = getDb();
  const { workspace, role } = membership;
  const groupIds = filter.map((g) => (g === 'none' ? null : g));
  const [groups, accounts, followers, counts, upcoming, progress] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    followerStats(db, workspace.id),
    overviewCounts(db, { workspaceId: workspace.id, groupIds, timeZone: workspace.timeZone }),
    upcomingTasks(db, { workspaceId: workspace.id, groupIds, limit: 30 }),
    setupProgress(db, workspace.id),
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
  // After HoneyBook's step-by-step list and Hootsuite's dismissible Getting Started card.
  const steps = [
    { title: '連結第一個社群帳號', detail: 'Facebook 粉專、Instagram 商業帳號或 LINE 官方帳號。', href: '/app/channels#add', done: progress.accounts, optional: false },
    { title: '送一則測試貼文', detail: '在「帳號與群組」按「送一則測試 dry-run」，看它從排程走到記錄，不會真的發出。', href: '/app/channels', done: progress.testRun, optional: false },
    { title: '把帳號分群組', detail: '例如依國家、子品牌或門市分，發文時可以一鍵選取一組帳號。', href: '/app/channels#groups', done: progress.groups, optional: true },
    { title: '設定品牌語氣', detail: 'AI 改寫與試寫都會照這裡的語氣、禁用詞與詞彙表。', href: '/app/voice', done: progress.voice, optional: true },
    { title: '邀請成員', detail: '讓編輯寫貼文、管理員核准。', href: '/app/members', done: progress.members, optional: true },
    { title: '開啟對外發文', detail: '確認測試沒問題後再開，之後到時間的貼文才會真的發出。', href: '/app/settings#publishing', done: progress.publishing, optional: false },
  ];
  const done = steps.filter((x) => x.done).length;
  const allDone = done === steps.length;
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

      {!progress.dismissed && !allDone && (
        <section className="card" aria-labelledby="h-setup">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h2 id="h-setup">開始使用 kdan-social</h2>
              <div className="row small muted" style={{ gap: 10, marginTop: 6 }}>
                <span>{done} / {steps.length} 完成</span>
                <span role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="設定進度" style={{ flex: '0 1 240px', height: 6, borderRadius: 3, background: 'var(--line-soft)', overflow: 'hidden', display: 'block' }}>
                  <span style={{ display: 'block', height: 6, width: `${(done / steps.length) * 100}%`, background: 'var(--ok)' }} />
                </span>
              </div>
            </div>
            <form action={dismissOnboardingAction}><button type="submit" className="btn icon-btn" aria-label="關閉設定清單" title="關閉設定清單" style={{ width: 32, height: 32, minHeight: 32, border: 0 }}><Icon name="close" size={16} /></button></form>
          </div>
          {steps.map((st) => (
            <a key={st.title} href={st.href} className="list-row" style={{ color: 'inherit', alignItems: 'center' }}>
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: st.done ? 0 : '2px solid var(--line)', background: st.done ? 'var(--ok)' : 'transparent', color: '#fff', fontSize: 13, fontWeight: 700 }}>{st.done ? '✓' : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, textDecoration: st.done ? 'line-through' : 'none', color: st.done ? 'var(--ink-3)' : 'var(--ink)' }}>{st.title}</span>
                {st.optional && <span className="tiny muted" style={{ marginLeft: 6 }}>選填</span>}
                <span className="small muted" style={{ display: 'block' }}>{st.detail}</span>
              </span>
              {!st.done && <Icon name="chevronRight" size={16} />}
            </a>
          ))}
        </section>
      )}

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

      {!live && (
        <div className="card card-pad row small" role="status" style={{ gap: 10 }}>
          <span style={{ flex: 1 }}><strong style={{ fontWeight: 600 }}>對外發文關閉中</strong>：到時間的貼文只會記錄為 dry-run，不會真的發出。</span>
          <a className="btn btn-sm" href="/app/settings#publishing">到設定開啟</a>
        </div>
      )}

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
                <a href={`/app/posts/${first.postId}`} style={{ color: 'inherit' }}>{first.title}</a>
                <div className="row" style={{ gap: 4, marginTop: 4 }}>
                  {tasks.map((t) => <Pf key={t.id} pf={t.platform} size="sm" bad={t.accountStatus !== 'active'} />)}
                  <span className="tiny muted">{tasks.length} 個帳號{spread ? ' · 依各帳號時區，從這個時間開始' : ''}</span>
                </div>
              </div>
              <a href={label === '待審核' || label === '要求修改' ? `/app/approvals?post=${first.postId}` : '/app/calendar'} style={{ color: 'inherit' }}>
                <Chip tone={tone}>{label}</Chip>
              </a>
            </div>
          );
        })}
      </section>
    </main>
  );
}
