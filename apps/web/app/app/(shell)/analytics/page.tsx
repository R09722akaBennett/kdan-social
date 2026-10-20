import { aiConfigured, followerSeries, formatInZone, IMPORT_WINDOW_DAYS, listAccounts, listGroups, performanceRows } from '@kdan-social/core';
import type { CSSProperties } from 'react';
import { FilterMenu } from '@/components/groups';
import { InsightsButton } from '@/components/insights';
import { AiHeader, GroupTag, Pf, SegLinks, fmtN } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { insightsAction } from '@/app/app/actions';

const COLOR = { facebook: '#1877F2', instagram: '#C13584', line: '#0B7A3B' } as const;

/** A follower line from real daily snapshots; one point or none draws nothing. */
function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (values.length < 2) return <div className="tiny muted" style={{ height: 36, display: 'flex', alignItems: 'center' }}>累積兩天以上的快照後會畫出走勢</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;
  const w = 240;
  const h = 36;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min + pad) / (max - min + 2 * pad)) * h).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// After TikTok's period pills and Later's per-post performance table, on the prototype's layout.
export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string; group?: string | string[] }> }) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const filter = [sp.group ?? []].flat();
  const groupIds = filter.map((g) => (g === 'none' ? null : g));
  const db = getDb();
  const now = new Date();
  const [groups, accounts, series, perf] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    followerSeries(db, { workspaceId: workspace.id, days, now }),
    performanceRows(db, { workspaceId: workspace.id, from: new Date(now.getTime() - days * 86_400_000), groupIds }),
  ]);
  const shown = accounts.filter((a) => filter.length === 0 || filter.includes(a.groupId ?? 'none'));
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;
  const latest = (id: string) => series.get(id)?.at(-1)?.followers ?? null;
  const href = (d: number) => {
    const q = new URLSearchParams({ days: String(d) });
    for (const g of filter) q.append('group', g);
    return `/app/analytics?${q}`;
  };

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>成效</h1>
          <div className="sub">近 {days} 天 · {shown.length} 個帳號 · 粉絲數每天更新一次，貼文互動在發文後的 30 天內每天更新</div>
        </div>
        <div className="row">
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} />
          <SegLinks label="期間" items={[7, 30, 90].map((d) => ({ href: href(d), text: `${d} 天`, on: d === days }))} />
        </div>
      </header>

      {aiConfigured() && (
        <section className="card card-ai card-pad stack" style={{ gap: 10 }}>
          <AiHeader title="AI 分析" note="只讀這頁的數字，每個結論都附出處" />
          <InsightsButton days={days} groups={filter} run={insightsAction} />
        </section>
      )}

      <section className="stack" aria-labelledby="h-fans">
        <h2 id="h-fans">粉絲數</h2>
        {shown.length === 0 && <div className="card card-pad small muted">沒有帳號。<a href="/app/channels">去連結</a></div>}
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
                  <GroupTag name={groupName(a.groupId)} />
                </div>
                <div className="row" style={{ alignItems: 'baseline' }}>
                  <span className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{last != null ? fmtN(last) : '—'}</span>
                  {grow != null && <span className="small" style={{ fontWeight: 500, color: grow >= 0 ? 'var(--ok)' : 'var(--err)' }}>{grow >= 0 ? '+' : ''}{fmtN(grow)}{first ? `（${((grow / first) * 100).toFixed(1)}%）` : ''}</span>}
                </div>
                <Sparkline values={s.map((x) => x.followers)} color={COLOR[a.platform]} label={`${a.name} 近 ${days} 天的粉絲數走勢`} />
                {s.length > 0 && s[0]!.day > new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10) && <div className="tiny" style={{ color: 'var(--ink-2)', background: 'var(--bg)', borderRadius: 6, padding: '6px 8px' }}>從 {s[0]!.day.slice(5).replace('-', '/')} 開始有快照，更早的部分沒有資料。</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="h-posts">
        <div className="card-head">
          <h2 id="h-posts">貼文成效</h2>
          <span className="small muted">每個帳號分列，含直接在平台上發的貼文（FB、IG 近 {IMPORT_WINDOW_DAYS} 天）；互動：FB 心情＋留言＋分享、IG 讚＋留言、LINE 點擊</span>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 860 }}>
            <thead><tr><th>貼文</th><th style={{ width: 220 }}>帳號</th><th style={{ width: 110 }}>發布</th><th className="right" style={{ width: 90 }}>互動</th><th className="right" style={{ width: 90 }}>LINE 開封</th><th className="right" style={{ width: 120 }}>互動率</th></tr></thead>
            <tbody>
              {perf.length === 0 && <tr><td colSpan={6} className="small muted">這段期間沒有發布的貼文。</td></tr>}
              {perf.map((p) => {
                const followers = latest(p.accountId);
                const rate = p.engagements != null && followers ? `${((p.engagements / followers) * 100).toFixed(2)}%` : '—';
                return (
                  <tr key={p.key}>
                    <td>
                      {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{p.title}</a> : p.title}
                      {p.source === 'platform' && <span className="mk" style={{ marginLeft: 6, padding: '0 6px' }} title="直接在平台上發的，不是透過 kdan-social">平台發布</span>}
                    </td>
                    <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Pf pf={p.platform} size="sm" />{p.account}</span></td>
                    <td className="num small">{p.publishedAt ? formatInZone(p.publishedAt, workspace.timeZone) : '—'}</td>
                    <td className="right num" title={p.detail ? Object.entries(p.detail).map(([k, v]) => `${k} ${v ?? '—'}`).join('、') : '明天會更新'}>{p.engagements != null ? fmtN(p.engagements) : p.fetchedAt ? '—' : '待更新'}</td>
                    <td className="right num">{p.platform === 'line' ? (p.opens != null ? fmtN(p.opens) : '—') : ''}</td>
                    <td className="right num" style={{ fontWeight: 600 }}>{rate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tiny muted" style={{ padding: '8px 16px 14px' }}>互動率＝互動 ÷ 目前粉絲數。觸及人數需要額外的 Meta 權限（之後送審時一起申請），目前不顯示；LINE 少於 20 人的數字平台不提供，顯示為「—」；LINE 開封是不重複人數。</div>
      </section>
    </main>
  );
}
