import { canReview, formatInZone, reviewDetail, reviewQueue, type QueueItem, type ReviewState } from '@kdan-social/core';
import type { CSSProperties } from 'react';
import { Chip, GroupTag, Pf, PLATFORM, errorText, zoneName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { reviewAction } from '@/app/app/actions';

// One decision per post, as Assembly's approvals inbox and Later's "Request Changes" card.
const DEC: Record<ReviewState, ['ok' | 'warn' | 'err', string]> = { approved: ['ok', '已核准'], pending: ['warn', '待審核'], changes_requested: ['err', '要求修改'] };
const ACTION: Record<string, string> = { 'post.created': '送出審核', 'post.approved': '核准', 'post.changes_requested': '要求修改' };

export default async function Approvals({ searchParams }: { searchParams: Promise<{ post?: string; notice?: string; error?: string }> }) {
  const { workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const db = getDb();
  const tz = workspace.timeZone;
  const queue = await reviewQueue(db, { workspaceId: workspace.id });
  const selectedId = sp.post ?? queue.find((q) => q.state !== 'approved')?.postId ?? queue[0]?.postId;
  const d = selectedId ? await reviewDetail(db, { workspaceId: workspace.id, postId: selectedId }) : null;
  const reviewer = canReview(role);
  const waiting = queue.filter((q) => q.state !== 'approved');
  const approved = queue.filter((q) => q.state === 'approved');

  const row = (it: QueueItem) => {
    const sel = it.postId === selectedId;
    const [tone, label] = DEC[it.state];
    return (
      <a key={it.postId} href={`/app/approvals?post=${it.postId}`} aria-current={sel ? 'true' : undefined}
        style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', borderBottom: '1px solid var(--line-soft)', background: sel ? '#F7F9FF' : '#fff', boxShadow: sel ? 'inset 3px 0 0 var(--accent)' : 'none', color: 'var(--ink)' }}>
        <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{it.title}</span><Chip tone={tone}>{label}</Chip></span>
        <span className="tiny muted">{it.createdBy ?? '—'} · {formatInZone(it.createdAt, tz)} 送出 · 第一則 {formatInZone(it.firstRunAt, tz)}</span>
        <span className="row" style={{ gap: 4 }}>
          {it.accounts.map((a) => <Pf key={a.id} pf={a.platform} size="sm" bad={a.status !== 'active'} />)}
          <span className="tiny muted">{it.accounts.length} 個帳號</span>
        </span>
      </a>
    );
  };

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>待審核</h1>
          <div className="sub">編輯送出的貼文，由擁有者或管理員核准後才會進排程。一篇貼文核准一次，涵蓋它的所有帳號。</div>
        </div>
      </header>

      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}
      {sp.notice && <div className="card card-pad small" role="status">{sp.notice}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section className="card" aria-label="送審清單" style={{ flex: '1 1 280px', maxWidth: 380, overflow: 'hidden' }}>
          <div className="tiny muted" style={{ padding: '12px 16px 6px', fontWeight: 600 }}>{reviewer ? '等你核准' : '等待核准'} {waiting.length}</div>
          {waiting.map(row)}
          {waiting.length === 0 && <div className="small muted" style={{ padding: '4px 16px 12px' }}>都處理完了。</div>}
          {approved.length > 0 && <div className="tiny muted" style={{ padding: '12px 16px 6px', fontWeight: 600 }}>已核准（近 7 天）</div>}
          {approved.map(row)}
        </section>

        {!d ? (
          <section className="card card-pad small muted" style={{ flex: '999 1 560px' }}>沒有要審核的貼文。編輯送出的貼文會出現在這裡。</section>
        ) : (
          <section aria-label="審核內容" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row" style={{ alignItems: 'baseline', gap: '8px 12px' }}>
                <h2 style={{ fontSize: 18 }}>{d.post.title}</h2>
                <span className="small muted">{d.post.createdBy ?? '—'} · {formatInZone(d.post.createdAt, tz)}</span>
                <span className="spacer"><Chip tone={DEC[d.state][0]}>{DEC[d.state][1]}</Chip></span>
              </div>
              {d.post.body !== null && (
                <>
                  <div className="tiny muted">主要文字</div>
                  <div className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sunken)', whiteSpace: 'pre-line' }}>{d.post.body || '（沒有文字）'}</div>
                </>
              )}
            </div>

            <div className="grid" style={{ '--min': '260px' } as CSSProperties}>
              {d.versions.map((v) => {
                const img = v.media[0];
                return (
                  <div key={v.accountId} className="card" style={{ overflow: 'hidden' }}>
                    <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', gap: 8, flexWrap: 'nowrap' }}>
                      <Pf pf={v.platform} bad={v.accountStatus !== 'active'} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 500 }}>{v.name}</span>
                        <span className="tiny muted">{PLATFORM[v.platform].name} · {zoneName(v.timeZone)} {formatInZone(v.runAt, v.timeZone)}</span>
                      </span>
                      <GroupTag name={v.groupName} />
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on our own storage domain */}
                    {img && <img src={img.previewUrl ?? img.url} alt={img.alt ?? ''} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />}
                    <div className="stack" style={{ padding: '10px 14px 14px', gap: 6 }}>
                      {d.post.body !== null && <span className="tiny" style={{ fontWeight: 600, color: v.customised ? 'var(--accent)' : 'var(--ink-3)' }}>{v.customised ? '個別調整過' : '使用主要文字'}</span>}
                      <div className="small" style={{ whiteSpace: 'pre-line' }}>{v.body || '（沒有文字）'}</div>
                      {v.accountStatus !== 'active' && <span className="tiny" style={{ color: 'var(--err)' }}>{errorText('authorization has expired')}</span>}
                      {v.taskStatus !== 'scheduled' && <span className="tiny muted">這個帳號的排定時間已過（{v.taskStatus}）</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <form action={reviewAction} className="card card-pad stack">
              <input type="hidden" name="postId" value={d.post.id} />
              <h3>留言與紀錄</h3>
              {d.history.map((h, i) => <div key={i} className="tiny muted">{h.actor} {ACTION[h.action] ?? h.action} · {formatInZone(h.at, tz)}</div>)}
              {d.comments.length === 0 && <div className="small muted">還沒有留言。</div>}
              {d.comments.map((c) => (
                <div key={c.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10 }}>
                  <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 15, background: 'var(--line-soft)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{c.author.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <div className="small"><strong style={{ fontWeight: 600 }}>{c.author}</strong> <span className="muted">{formatInZone(c.createdAt, tz)}</span></div>
                    <div className="small" style={{ whiteSpace: 'pre-line' }}>{c.body}</div>
                  </div>
                </div>
              ))}
              <label htmlFor="cmt" className="sr-only">留言</label>
              <textarea id="cmt" name="comment" className="textarea small" rows={2} maxLength={2000} placeholder={reviewer ? '寫下要修改的地方；要求修改時必填' : '寫下留言'} />
              <div className="row" style={{ gap: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                <span className="small" style={{ flex: '1 1 240px', color: 'var(--ink-2)' }}>
                  {!d.open ? '排定時間都已經過了，不能再改變審核結果。'
                    : d.state === 'approved' ? '已核准，貼文會在排定的時間發出。'
                    : reviewer ? `核准後 ${d.versions.length} 個帳號會依各自的排定時間發布。` : '等擁有者或管理員核准。'}
                </span>
                <button type="submit" name="intent" value="comment" className="btn">只留言</button>
                {reviewer && d.open && <button type="submit" name="intent" value="request_changes" className="btn">要求修改</button>}
                {reviewer && d.open && <button type="submit" name="intent" value="approve" className="btn btn-ok" disabled={d.state === 'approved'}>{d.state === 'approved' ? '已核准' : '核准'}</button>}
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
