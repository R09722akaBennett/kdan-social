import { formatInZone, reviewDetail } from '@kdan-social/core';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { ConfirmSubmit } from '@/components/confirm';
import { Chip, commentErrorText, GroupTag, Pf, PLATFORM, errorText, zoneName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { cancelPostAction } from '@/app/app/actions';
import { NoticeToast } from '@/components/toast';

const TASK: Record<string, ['ok' | 'plan' | 'warn' | 'err' | 'neutral', string]> = {
  scheduled: ['plan', '已排程'], running: ['plan', '發送中'], published: ['ok', '已發布'], dry_run: ['neutral', 'dry-run'],
  failed: ['err', '失敗'], needs_check: ['warn', '需人工確認'], missed: ['warn', '未核准，已略過'], cancelled: ['neutral', '已取消'],
};
const REVIEW: Record<string, ['ok' | 'warn' | 'err', string]> = { approved: ['ok', '已核准'], pending: ['warn', '待審核'], changes_requested: ['err', '要求修改'] };
const ACTION: Record<string, string> = { 'post.created': '建立了貼文', 'post.edited': '修改了貼文', 'post.approved': '核准', 'post.changes_requested': '要求修改', 'post.cancelled': '取消了排程' };

/** Where a published post can be opened: the link read back from the account, or a Facebook URL built from its id. */
function postLink(platform: string, externalId: string | null, permalink: string | null) {
  if (permalink) return permalink;
  if (platform === 'facebook' && externalId?.includes('_')) {
    const [page, post] = externalId.split('_');
    return `https://www.facebook.com/${page}/posts/${post}`;
  }
  return null;
}

// After Hootsuite's scheduled-post panel (edit and delete beside the preview) and
// Assembly's post page (status, then comments and activity).
export default async function PostDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, workspace, role } = await requireWorkspace();
  const d = await reviewDetail(getDb(), { workspaceId: workspace.id, postId: id });
  if (!d) notFound();
  const tz = workspace.timeZone;
  const manager = role === 'owner' || role === 'admin';
  const mine = manager || d.post.createdBy === user.email;
  const scheduled = d.versions.filter((v) => v.taskStatus === 'scheduled');
  const editable = mine && d.versions.length > 0 && scheduled.length === d.versions.length;
  const cancelled = d.versions.length > 0 && d.versions.every((v) => v.taskStatus === 'cancelled');

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <div className="small"><a href="/app/calendar">行事曆</a> / 貼文</div>
          <h1 style={{ marginTop: 4 }}>{d.post.title}</h1>
          <div className="sub">{d.post.createdBy ?? '—'} · {formatInZone(d.post.createdAt, tz)} 建立 · {d.versions.length} 個帳號</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {d.open && (d.state === 'pending' || d.state === 'changes_requested') && <a className="btn" href={`/app/approvals?post=${d.post.id}`}>到待審核</a>}
          {editable && <a className="btn" href={`/app/posts/${d.post.id}/edit`}>修改</a>}
          {mine && scheduled.length > 0 && (
            <form action={cancelPostAction}>
              <input type="hidden" name="postId" value={d.post.id} />
              <ConfirmSubmit className="btn btn-danger" question={`取消這篇貼文還沒發出的 ${scheduled.length} 個帳號？已經發出的不受影響。`}>取消排程</ConfirmSubmit>
            </form>
          )}
        </div>
      </header>
      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}
      {sp.notice && <NoticeToast text={sp.notice} />}

      <div className="row" style={{ gap: 8 }}>
        {cancelled ? <Chip tone="neutral">已取消</Chip> : <Chip tone={REVIEW[d.state]![0]}>{REVIEW[d.state]![1]}</Chip>}
        {d.post.body !== null && <span className="small muted">主要文字：{d.post.body.split('\n')[0]?.slice(0, 60) || '（沒有文字）'}</span>}
      </div>

      <div className="grid" style={{ '--min': '280px' } as CSSProperties}>
        {d.versions.map((v) => {
          const [tone, label] = TASK[v.taskStatus] ?? ['neutral', v.taskStatus];
          const link = v.taskStatus === 'published' ? postLink(v.platform, v.externalPostId, v.permalink) : null;
          const img = v.media[0];
          return (
            <div key={v.accountId} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', gap: 8, flexWrap: 'nowrap' }}>
                <Pf pf={v.platform} bad={v.accountStatus !== 'active'} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 500 }}>{v.name}</span>
                  <span className="tiny muted">{PLATFORM[v.platform].name} · {formatInZone(v.runAt, v.timeZone)}（{zoneName(v.timeZone)}）</span>
                </span>
                <GroupTag name={v.groupName} />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on our own storage domain */}
              {img && <img src={img.previewUrl ?? img.url} alt={img.alt ?? ''} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />}
              <div className="stack" style={{ padding: '10px 14px 14px', gap: 8, flex: 1 }}>
                <div className="small" style={{ whiteSpace: 'pre-line' }}>{v.body || '（沒有文字）'}</div>
                <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
                  <Chip tone={tone}>{label}</Chip>
                  {link && <a className="small" href={link} target="_blank" rel="noreferrer">看貼文</a>}
                </div>
                {v.lastError && v.taskStatus !== 'published' && <span className="tiny" style={{ color: 'var(--err)' }}>{errorText(v.lastError)}</span>}
                {v.commentError && <span className="tiny" style={{ color: 'var(--warn)' }}>{commentErrorText(v.commentError)}</span>}
                {v.commentId && <span className="tiny muted">已留下第一則留言</span>}
              </div>
            </div>
          );
        })}
      </div>

      <section className="card card-pad stack" aria-labelledby="h-activity">
        <h2 id="h-activity">紀錄與留言</h2>
        {d.history.map((h, i) => <div key={i} className="small"><span className="muted">{formatInZone(h.at, tz)}</span> {h.actor} {ACTION[h.action] ?? h.action}</div>)}
        {d.comments.map((c) => <div key={c.id} className="small"><span className="muted">{formatInZone(c.createdAt, tz)}</span> <strong style={{ fontWeight: 600 }}>{c.author}</strong>：{c.body}</div>)}
        {d.history.length === 0 && d.comments.length === 0 && <div className="small muted">沒有紀錄。</div>}
      </section>
    </main>
  );
}
