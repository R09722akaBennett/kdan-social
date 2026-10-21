import { formatInZone, globalPublishingEnabled, INBOX_WINDOW_DAYS, listAccounts, listInbox, publishingAllowed } from '@kdan-social/core';
import Link from 'next/link';
import { refreshInboxAction, replyCommentAction, setCommentStatusAction } from '@/app/app/actions';
import { ReplyForm } from '@/components/reply-form';
import { NoticeToast } from '@/components/toast';
import { EmptyState, Icon, Pf } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';

type Row = Awaited<ReturnType<typeof listInbox>>[number];

/**
 * Comments under the accounts' posts, after Buffer's Community "By post" view: grouped by
 * post, replies under the comment they answer, each open one answerable in place.
 */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ status?: string; account?: string; notice?: string; error?: string }> }) {
  const [sp, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const status = sp.status === 'done' ? 'done' : 'open';
  const db = getDb();
  const accounts = (await listAccounts(db, workspace.id)).filter((a) => a.platform !== 'line');
  const accountId = accounts.find((a) => a.id === sp.account)?.id;
  const rows = await listInbox(db, { workspaceId: workspace.id, status, accountId });
  const live = publishingAllowed(globalPublishingEnabled(), workspace);
  const tz = workspace.timeZone;
  const q = (p: { status?: string; account?: string | null }) => {
    const s = new URLSearchParams();
    if ((p.status ?? status) === 'done') s.set('status', 'done');
    const acc = p.account === undefined ? accountId : p.account;
    if (acc) s.set('account', acc);
    return `/app/inbox${s.size ? `?${s}` : ''}`;
  };
  const back = q({});

  // One card per post; in it, comments oldest first, each followed by the replies to it.
  const posts = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.accountId}:${r.comment.postExternalId}`;
    posts.set(key, [...(posts.get(key) ?? []), r]);
  }
  const byTime = (a: Row, b: Row) => a.comment.commentedAt.getTime() - b.comment.commentedAt.getTime();
  const thread = (list: Row[]) => {
    const tops = list.filter((r) => !r.comment.parentExternalId || !list.some((x) => x.comment.externalId === r.comment.parentExternalId));
    return tops.sort(byTime).flatMap((t) => [t, ...list.filter((r) => r.comment.parentExternalId === t.comment.externalId).sort(byTime)]);
  };

  return (
    <main className="main" style={{ maxWidth: 900 }}>
      {sp.notice && <NoticeToast text={sp.notice} />}
      {sp.error && <NoticeToast text={sp.error} tone="err" />}
      <header className="page-head">
        <div>
          <h1>留言</h1>
          <div className="sub">Facebook 與 Instagram 近 {INBOX_WINDOW_DAYS} 天貼文底下的留言，每天凌晨更新。</div>
        </div>
        <form action={refreshInboxAction}><button type="submit" className="btn"><Icon name="refresh" size={16} />立即更新</button></form>
      </header>

      {!live && <div className="card card-pad small" role="status"><strong style={{ fontWeight: 600 }}>對外發文關閉中</strong>：回覆只會記錄為 dry-run，不會真的留在貼文底下。</div>}

      <nav className="channel-tabs" aria-label="留言狀態">
        <Link href={q({ status: 'open' })} aria-current={status === 'open' ? 'page' : undefined}>待處理</Link>
        <Link href={q({ status: 'done' })} aria-current={status === 'done' ? 'page' : undefined}>已處理</Link>
        {accounts.length > 1 && (
          <span className="row" style={{ marginLeft: 'auto', gap: 6, alignSelf: 'center' }}>
            <Link href={q({ account: null })} className="btn btn-sm" aria-pressed={!accountId}>全部帳號</Link>
            {accounts.map((a) => <Link key={a.id} href={q({ account: a.id })} className="btn btn-sm" aria-pressed={a.id === accountId}><Pf pf={a.platform} size="sm" />{a.name}</Link>)}
          </span>
        )}
      </nav>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon="comment" title={status === 'open' ? '沒有待處理的留言' : '還沒有處理過的留言'}>
            {status === 'open' ? '新的留言會出現在這裡。想現在就讀一次，按右上角的「立即更新」。' : '回覆過或標為處理完成的留言會移到這裡。'}
          </EmptyState>
        </div>
      ) : (
        [...posts.values()].map((list) => {
          const head = list[0]!;
          return (
            <section key={`${head.accountId}:${head.comment.postExternalId}`} className="card inbox-post">
              <div className="row inbox-post-head">
                <Pf pf={head.platform} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="small" style={{ fontWeight: 600, display: 'block' }}>{head.account}</span>
                  <span className="small muted inbox-post-text">{head.postText?.split('\n')[0] || '（這篇貼文沒有文字）'}</span>
                </span>
                {head.permalink && <a className="small" href={head.permalink} target="_blank" rel="noreferrer">看貼文</a>}
              </div>
              {thread(list).map((r) => (
                <div key={r.comment.id} className="inbox-comment" data-reply={!!r.comment.parentExternalId}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="inbox-avatar" aria-hidden="true">{r.comment.author.slice(0, 1)}</span>
                    <strong style={{ fontWeight: 600 }}>{r.comment.author}</strong>
                    <span className="tiny muted">{formatInZone(r.comment.commentedAt, tz)}</span>
                    <span className="spacer" />
                    <form action={setCommentStatusAction}>
                      <input type="hidden" name="id" value={r.comment.id} />
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="status" value={status === 'open' ? 'done' : 'open'} />
                      <button type="submit" className="btn btn-sm">{status === 'open' ? '標為處理完成' : '移回待處理'}</button>
                    </form>
                  </div>
                  <p className="inbox-text">{r.comment.text || <span className="muted">（只有貼圖或圖片）</span>}</p>
                  {r.comment.replyText && <div className="small inbox-replied">你在 {r.comment.repliedAt ? formatInZone(r.comment.repliedAt, tz) : ''} 回覆：{r.comment.replyText}</div>}
                  {status === 'open' && <ReplyForm action={replyCommentAction} id={r.comment.id} author={r.comment.author} back={back} />}
                </div>
              ))}
            </section>
          );
        })
      )}
    </main>
  );
}
