import { aiConfigured, audienceFor, dailyTotals, followerSeries, formatInZone, IMPORT_WINDOW_DAYS, listAccounts, listGroups, performanceRows, type PerformanceRow, type Totals } from '@kdan-social/core';
import type { CSSProperties } from 'react';
import { BarList } from '@/components/barlist';
import { TrendChart } from '@/components/charts';
import { FilterMenu } from '@/components/groups';
import { InsightsButton } from '@/components/insights';
import { AiHeader, GroupTag, Pf, SegLinks, fmtN } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { insightsAction } from '@/app/app/actions';

const PLATFORM_COLOR = { facebook: '#1877F2', instagram: '#C13584', line: '#0B7A3B' } as const;
// Validated as a pair against the white surface: distinct for colour-blind readers and >= 3:1.
const SERIES = [{ key: 'reach', label: '觸及（每日加總）', color: '#2B4FD8' }, { key: 'views', label: '觀看', color: '#C2610A' }];
const KIND_LABEL: Record<string, string> = { age: '年齡', gender: '性別', country: '國家', city: '城市', area: '地區', app: '裝置', tenure: '成為好友多久' };
const SORTS = { date: '發布時間', reach: '觸及', views: '觀看', engagements: '互動', rate: '互動率' } as const;
type Sort = keyof typeof SORTS;

/** Change against the previous period, as X's overview shows it; null when there is nothing to compare. */
function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now == null || !before) return <span className="tiny muted">沒有上一期可比較</span>;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  return <span className="tiny" style={{ color: up ? 'var(--ok)' : 'var(--err)', fontWeight: 600 }} aria-label={`比上一期${up ? '增加' : '減少'} ${Math.abs(pct).toFixed(0)}%`}>{up ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}% <span className="muted" style={{ fontWeight: 400 }}>比上一期</span></span>;
}

const rate = (t: Pick<Totals, 'engagements' | 'reach'>) => (t.engagements != null && t.reach ? (t.engagements / t.reach) * 100 : null);
const net = (t: Pick<Totals, 'follows' | 'unfollows'>) => (t.follows == null && t.unfollows == null ? null : (t.follows ?? 0) - (t.unfollows ?? 0));

function postRate(p: PerformanceRow, followers: number | null) {
  if (p.engagements == null) return null;
  if (p.reach) return { value: (p.engagements / p.reach) * 100, base: 'reach' as const };
  return followers ? { value: (p.engagements / followers) * 100, base: 'followers' as const } : null;
}

// Tabs after Later's Overview / Post Performance / Audience; overview cards and the trend
// after X's account overview; audience bars after Pinterest's audience insights.
export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string; group?: string | string[]; tab?: string; sort?: string }> }) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const tab = sp.tab === 'posts' || sp.tab === 'audience' ? sp.tab : 'overview';
  const sort: Sort = (sp.sort && sp.sort in SORTS ? sp.sort : 'date') as Sort;
  const filter = [sp.group ?? []].flat();
  const groupIds = filter.map((g) => (g === 'none' ? null : g));
  const db = getDb();
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const [groups, accounts, series, totals, perf, audience] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    followerSeries(db, { workspaceId: workspace.id, days, now }),
    dailyTotals(db, { workspaceId: workspace.id, from, to: now, groupIds }),
    performanceRows(db, { workspaceId: workspace.id, from, groupIds }),
    audienceFor(db, { workspaceId: workspace.id, groupIds }),
  ]);
  const shown = accounts.filter((a) => filter.length === 0 || filter.includes(a.groupId ?? 'none'));
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;
  const latest = (id: string) => series.get(id)?.at(-1)?.followers ?? null;
  const href = (p: Partial<{ days: number; tab: string; sort: string }>) => {
    const q = new URLSearchParams({ days: String(p.days ?? days), tab: p.tab ?? tab });
    if ((p.sort ?? (tab === 'posts' ? sort : '')) && (p.tab ?? tab) === 'posts') q.set('sort', p.sort ?? sort);
    for (const g of filter) q.append('group', g);
    return `/app/analytics?${q}`;
  };
  const c = totals.current;
  const p = totals.previous;
  const sorted = [...perf].sort((x, y) => {
    if (sort === 'date') return 0;
    const val = (r: PerformanceRow) => (sort === 'rate' ? postRate(r, latest(r.accountId))?.value : r[sort]) ?? -1;
    return val(y) - val(x);
  });

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>成效</h1>
          <div className="sub">近 {days} 天 · {shown.length} 個帳號 · 每天凌晨更新；IG 的數字最多晚 48 小時</div>
        </div>
        <div className="row">
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} />
          <SegLinks label="期間" items={[7, 30, 90].map((d) => ({ href: href({ days: d }), text: `${d} 天`, on: d === days }))} />
        </div>
      </header>

      <nav className="tabs" aria-label="成效分頁" style={{ padding: 0 }}>
        {([['overview', '總覽'], ['posts', '貼文'], ['audience', '受眾']] as const).map(([k, l]) => <a key={k} href={href({ tab: k })} aria-current={tab === k ? 'page' : undefined}>{l}</a>)}
      </nav>

      {tab === 'overview' && (
        <>
          <section className="grid" style={{ '--min': '180px' } as CSSProperties} aria-label="重點數字">
            {[
              { label: '觸及（每日加總）', value: c.reach, before: p.reach, fmt: fmtN },
              { label: '觀看', value: c.views, before: p.views, fmt: fmtN },
              { label: '互動', value: c.engagements, before: p.engagements, fmt: fmtN },
              { label: '互動率', value: rate(c), before: rate(p), fmt: (n: number) => `${n.toFixed(2)}%` },
              { label: '淨增追蹤', value: net(c), before: net(p), fmt: (n: number) => `${n >= 0 ? '+' : ''}${fmtN(n)}` },
            ].map((k) => (
              <div key={k.label} className="card stat">
                <span className="small muted">{k.label}</span>
                <span className="value">{k.value != null ? k.fmt(k.value) : '—'}</span>
                <Delta now={k.value} before={k.before} />
              </div>
            ))}
          </section>

          <section className="card card-pad stack" aria-labelledby="h-trend">
            <h2 id="h-trend">每日觸及與觀看</h2>
            <TrendChart points={totals.days.map((d) => ({ day: d.day, reach: d.reach, views: d.views }))} series={SERIES} label={`近 ${days} 天每日觸及與觀看的走勢`} />
            <span className="tiny muted">觸及是每天、每個帳號各自不重複的人數再加總，同一個人在不同天、不同帳號會重複計算。LINE 沒有這兩項數字。</span>
          </section>

          {aiConfigured() && (
            <section className="card card-ai card-pad stack" style={{ gap: 10 }}>
              <AiHeader title="AI 分析" note="只讀這頁的數字，每個結論都附出處" />
              <InsightsButton days={days} groups={filter} run={insightsAction} />
            </section>
          )}

          <section className="card" aria-labelledby="h-accounts">
            <div className="card-head"><h2 id="h-accounts">各帳號</h2></div>
            <div className="table-wrap">
              <table style={{ minWidth: 720 }}>
                <thead><tr><th>帳號</th><th className="right">粉絲</th><th className="right">觸及</th><th className="right">觀看</th><th className="right">互動</th><th className="right">淨增追蹤</th></tr></thead>
                <tbody>
                  {shown.map((a) => {
                    const t = totals.byAccount.get(a.id);
                    const n = t ? net(t) : null;
                    return (
                      <tr key={a.id}>
                        <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Pf pf={a.platform} size="sm" />{a.name}<GroupTag name={groupName(a.groupId)} /></span></td>
                        <td className="right num">{latest(a.id) != null ? fmtN(latest(a.id)!) : '—'}</td>
                        <td className="right num">{t?.reach != null ? fmtN(t.reach) : '—'}</td>
                        <td className="right num">{t?.views != null ? fmtN(t.views) : '—'}</td>
                        <td className="right num">{t?.engagements != null ? fmtN(t.engagements) : '—'}</td>
                        <td className="right num">{n != null ? `${n >= 0 ? '+' : ''}${fmtN(n)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="stack" aria-labelledby="h-fans">
            <h2 id="h-fans">粉絲數走勢</h2>
            <div className="grid">
              {shown.map((a) => {
                const s = series.get(a.id) ?? [];
                const first = s[0]?.followers;
                const last = s.at(-1)?.followers;
                const grow = first != null && last != null && s.length > 1 ? last - first : null;
                return (
                  <div key={a.id} className="card stack" style={{ padding: '14px 16px', gap: 6 }}>
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                      <Pf pf={a.platform} size="sm" />
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.name}</span>
                    </div>
                    <div className="row" style={{ alignItems: 'baseline' }}>
                      <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{last != null ? fmtN(last) : '—'}</span>
                      {grow != null && <span className="small" style={{ fontWeight: 500, color: grow >= 0 ? 'var(--ok)' : 'var(--err)' }}>{grow >= 0 ? '+' : ''}{fmtN(grow)}</span>}
                    </div>
                    <TrendChart points={s.map((x) => ({ day: x.day, followers: x.followers }))} series={[{ key: 'followers', label: '粉絲', color: PLATFORM_COLOR[a.platform] }]} label={`${a.name} 的粉絲數走勢`} compact />
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {tab === 'posts' && (
        <section className="card" aria-labelledby="h-posts">
          <div className="card-head">
            <h2 id="h-posts">貼文成效</h2>
            <span className="small muted">含直接在平台上發的貼文（FB、IG 近 {IMPORT_WINDOW_DAYS} 天）</span>
          </div>
          <div className="table-wrap">
            <table style={{ minWidth: 1040 }}>
              <thead>
                <tr>
                  <th>貼文</th><th style={{ width: 200 }}>帳號</th>
                  {(Object.keys(SORTS) as Sort[]).map((k) => (
                    <th key={k} className={k === 'date' ? undefined : 'right'} style={{ width: k === 'date' ? 110 : 90 }}>
                      <a href={href({ sort: k })} aria-current={sort === k ? 'true' : undefined} style={{ color: sort === k ? 'var(--ink)' : 'var(--ink-2)', fontWeight: sort === k ? 700 : 500 }}>{SORTS[k]}{sort === k ? ' ↓' : ''}</a>
                    </th>
                  ))}
                  <th className="right" style={{ width: 70 }}>收藏</th><th className="right" style={{ width: 70 }}>分享</th><th className="right" style={{ width: 96, whiteSpace: "nowrap" }}>LINE 開封</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && <tr><td colSpan={10} className="small muted">這段期間沒有發布的貼文。</td></tr>}
                {sorted.map((row) => {
                  const r = postRate(row, latest(row.accountId));
                  const saves = row.insights?.saved ?? null;
                  const shares = row.insights?.shares ?? row.detail?.shares ?? null;
                  return (
                    <tr key={row.key}>
                      <td>
                        {row.permalink ? <a href={row.permalink} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{row.title}</a> : row.title}
                        {row.source === 'platform' && <span className="mk" style={{ marginLeft: 6, padding: '0 6px' }} title="直接在平台上發的，不是透過 kdan-social">平台發布</span>}
                      </td>
                      <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Pf pf={row.platform} size="sm" />{row.account}</span></td>
                      <td className="num small">{row.publishedAt ? formatInZone(row.publishedAt, workspace.timeZone) : '—'}</td>
                      <td className="right num">{row.reach != null ? fmtN(row.reach) : '—'}</td>
                      <td className="right num">{row.views != null ? fmtN(row.views) : '—'}</td>
                      <td className="right num">{row.engagements != null ? fmtN(row.engagements) : row.fetchedAt ? '—' : '待更新'}</td>
                      <td className="right num" style={{ fontWeight: 600 }} title={r?.base === 'followers' ? '沒有觸及數，以粉絲數計算' : undefined}>{r ? `${r.value.toFixed(2)}%${r.base === 'followers' ? '*' : ''}` : '—'}</td>
                      <td className="right num">{saves != null ? fmtN(saves) : '—'}</td>
                      <td className="right num">{shares != null ? fmtN(shares) : '—'}</td>
                      <td className="right num">{row.platform === 'line' ? (row.opens != null ? fmtN(row.opens) : '—') : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="tiny muted" style={{ padding: '8px 16px 14px' }}>互動率＝互動 ÷ 觸及；標 * 的貼文沒有觸及數，改用目前粉絲數計算。互動：FB 心情＋留言＋分享、IG 讚＋留言、LINE 點擊。少於門檻的數字平台不提供，顯示為「—」。</div>
        </section>
      )}

      {tab === 'audience' && (
        <section className="grid" style={{ '--min': '360px' } as CSSProperties} aria-label="受眾">
          {shown.map((a) => {
            const list = audience.get(a.id) ?? [];
            return (
              <div key={a.id} className="card card-pad stack" style={{ gap: 14 }}>
                <div className="row" style={{ gap: 8 }}><Pf pf={a.platform} /><span style={{ fontWeight: 600 }}>{a.name}</span><GroupTag name={groupName(a.groupId)} /></div>
                {list.length === 0 && (
                  <div className="small muted">
                    {a.platform === 'line' ? 'LINE 要有 20 位以上的好友才提供受眾資料。' : `${a.platform === 'instagram' ? 'Instagram 要 100 位以上粉絲' : 'Facebook 要有足夠的粉絲'}才提供受眾資料；也可能是連結時沒有授權觸及權限。`}
                  </div>
                )}
                {list.map((b) => (
                  <div key={b.kind} className="stack" style={{ gap: 6 }}>
                    <span className="small" style={{ fontWeight: 600 }}>{KIND_LABEL[b.kind] ?? b.kind}</span>
                    <BarList items={b.items} unit={b.unit} color={PLATFORM_COLOR[a.platform]} />
                  </div>
                ))}
                {list[0] && <span className="tiny muted">{formatInZone(list[0].fetchedAt, workspace.timeZone)} 更新；比例以列出的人數為分母。</span>}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
