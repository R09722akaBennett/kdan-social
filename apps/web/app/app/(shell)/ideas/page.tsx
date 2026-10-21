import { formatInZone, IDEA_STATUSES, listFeedItems, listFeeds, listIdeas, type IdeaStatus } from '@kdan-social/core';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { addFeedAction, deleteFeedAction, deleteIdeaAction, feedToIdeaAction, moveIdeaAction, refreshFeedsAction, saveIdeaAction } from '@/app/app/actions';
import { ConfirmSubmit } from '@/components/confirm';
import { IdeaDialog } from '@/components/idea-dialog';
import { NoticeToast } from '@/components/toast';
import { EmptyState, Icon } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { TEMPLATE_KINDS, TEMPLATES } from '@/lib/templates';

const COLUMN: Record<IdeaStatus, string> = { unassigned: '未分類', todo: '待辦', in_progress: '進行中', done: '完成' };

/**
 * Where posts start, after Buffer's Create: a board of ideas the workspace shares, and a
 * library of writing prompts. Either one opens the composer with its text.
 */
export default async function Ideas({ searchParams }: { searchParams: Promise<{ tab?: string; feed?: string; notice?: string; error?: string }> }) {
  const [sp, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const templates = sp.tab === 'templates';
  const feedsTab = sp.tab === 'feeds';
  const board = templates || feedsTab ? null : await listIdeas(getDb(), workspace.id);
  const [feedList, entries] = feedsTab
    ? await Promise.all([listFeeds(getDb(), workspace.id), listFeedItems(getDb(), { workspaceId: workspace.id, feedId: sp.feed })])
    : [[], []];
  const currentFeed = feedList.find((f) => f.id === sp.feed);

  return (
    <main className="main">
      {sp.notice && <NoticeToast text={sp.notice} />}
      <header className="page-head">
        <div>
          <h1>點子與範本</h1>
          <div className="sub">先把想法記下來，準備好了再轉成貼文。</div>
        </div>
        {!templates && !feedsTab && (
          <IdeaDialog action={saveIdeaAction} idea={{ status: 'unassigned' }} className="btn btn-primary" label="新增點子">
            <Icon name="plus" size={16} stroke={2} />新增點子
          </IdeaDialog>
        )}
      </header>

      <nav className="channel-tabs" aria-label="點子與範本">
        <Link href="/app/ideas" aria-current={templates || feedsTab ? undefined : 'page'}>點子</Link>
        <Link href="/app/ideas?tab=templates" aria-current={templates ? 'page' : undefined}>範本<span className="channel-count num">{TEMPLATES.length}</span></Link>
        <Link href="/app/ideas?tab=feeds" aria-current={feedsTab ? 'page' : undefined}>動態</Link>
      </nav>

      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}

      {/* After Buffer's Feeds: follow blogs and news by RSS, and turn an entry into a post or an idea. */}
      {feedsTab && (
        <div className="stack" style={{ gap: 14 }}>
          <form action={addFeedAction} className="card card-pad row" style={{ gap: 10 }}>
            <label htmlFor="feed-url" className="small" style={{ fontWeight: 600 }}>新增來源</label>
            <input id="feed-url" name="url" type="url" required className="input" placeholder="部落格或新聞網站的網址，或它的 RSS（例如 https://example.com/feed）" style={{ flex: '1 1 320px', minHeight: 36 }} />
            <button type="submit" className="btn btn-primary">訂閱</button>
          </form>
          {feedList.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              <Link href="/app/ideas?tab=feeds" className="btn btn-sm" aria-pressed={!currentFeed}>全部來源</Link>
              {feedList.map((f) => <Link key={f.id} href={`/app/ideas?tab=feeds&feed=${f.id}`} className="btn btn-sm" aria-pressed={f.id === currentFeed?.id}>{f.title}</Link>)}
              <span className="spacer" />
              <form action={refreshFeedsAction}><button type="submit" className="btn btn-sm"><Icon name="refresh" size={14} />立即更新</button></form>
            </div>
          )}
          {currentFeed && (
            <div className="card card-pad row small" style={{ gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontWeight: 600 }}>{currentFeed.title}</strong>
                <span className="muted"> · {currentFeed.lastFetchedAt ? `${formatInZone(currentFeed.lastFetchedAt, workspace.timeZone)} 更新` : '還沒讀過'}</span>
                {currentFeed.lastError && <span style={{ color: 'var(--err)', display: 'block' }}>上次讀取失敗：{currentFeed.lastError}</span>}
              </span>
              <form action={deleteFeedAction}>
                <input type="hidden" name="id" value={currentFeed.id} />
                <ConfirmSubmit className="btn btn-sm" question={`取消訂閱「${currentFeed.title}」？它的文章會一起移除。`}>取消訂閱</ConfirmSubmit>
              </form>
            </div>
          )}
          {entries.length === 0 ? (
            <div className="card">
              <EmptyState icon="link" title={feedList.length ? '還沒有文章' : '訂閱第一個來源'}>
                {feedList.length ? '來源有新文章時，每天凌晨會更新到這裡。' : '貼上常看的部落格或新聞網站網址，新文章會出現在這裡，可以直接轉成貼文或存成點子。'}
              </EmptyState>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {entries.map((e) => (
                <article key={e.id} className="card feed-entry">
                  {e.imageUrl && <img src={e.imageUrl} alt="" className="feed-thumb" loading="lazy" />}
                  <div style={{ flex: 1, minWidth: 0 }} className="stack">
                    <div style={{ fontWeight: 600 }}>{e.link ? <a href={e.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{e.title}</a> : e.title}</div>
                    <div className="tiny muted">{e.feed.title}{e.publishedAt ? ` · ${formatInZone(e.publishedAt, workspace.timeZone)}` : ''}</div>
                    {e.summary && <p className="small idea-body">{e.summary}</p>}
                    <div className="row" style={{ gap: 6 }}>
                      <Link href={`/app/posts/new?feedItem=${e.id}`} className="btn btn-sm">轉成貼文</Link>
                      <form action={feedToIdeaAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="btn btn-sm">存成點子</button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {board && (
        <div className="idea-board">
          {IDEA_STATUSES.map((status, col) => (
            <section key={status} className="idea-column" aria-labelledby={`col-${status}`}>
              <div className="row idea-column-head">
                <h2 id={`col-${status}`}>{COLUMN[status]}</h2>
                <span className="channel-count num">{board[status].length}</span>
                <span className="spacer" />
                <IdeaDialog action={saveIdeaAction} idea={{ status }} className="btn icon-btn connect-icon" label={`在「${COLUMN[status]}」新增點子`}><Icon name="plus" size={16} /></IdeaDialog>
              </div>
              {board[status].map((idea) => (
                <article key={idea.id} className="card idea-card">
                  <div style={{ fontWeight: 600 }}>{idea.title}</div>
                  {idea.body && <p className="small idea-body">{idea.body}</p>}
                  <div className="tiny muted">{idea.createdBy}</div>
                  <div className="row idea-actions">
                    {col > 0 && (
                      <form action={moveIdeaAction}>
                        <input type="hidden" name="id" value={idea.id} />
                        <button type="submit" name="status" value={IDEA_STATUSES[col - 1]} className="btn btn-sm" aria-label={`移到「${COLUMN[IDEA_STATUSES[col - 1]!]}」`}><Icon name="chevronLeft" size={14} /></button>
                      </form>
                    )}
                    {col < IDEA_STATUSES.length - 1 && (
                      <form action={moveIdeaAction}>
                        <input type="hidden" name="id" value={idea.id} />
                        <button type="submit" name="status" value={IDEA_STATUSES[col + 1]} className="btn btn-sm" aria-label={`移到「${COLUMN[IDEA_STATUSES[col + 1]!]}」`}><Icon name="chevronRight" size={14} /></button>
                      </form>
                    )}
                    <span className="spacer" />
                    <IdeaDialog action={saveIdeaAction} idea={{ id: idea.id, title: idea.title, body: idea.body, status }} className="btn btn-sm icon-btn" label={`編輯「${idea.title}」`}><Icon name="edit" size={14} /></IdeaDialog>
                    <form action={deleteIdeaAction}>
                      <input type="hidden" name="id" value={idea.id} />
                      <ConfirmSubmit question={`刪除點子「${idea.title}」？`} className="btn btn-sm icon-btn"><Icon name="trash" size={14} /></ConfirmSubmit>
                    </form>
                    <Link href={`/app/posts/new?idea=${idea.id}`} className="btn btn-sm">轉成貼文</Link>
                  </div>
                </article>
              ))}
              {board[status].length === 0 && <div className="small muted idea-empty">{status === 'unassigned' ? '想到什麼都先丟進來。' : '沒有點子。'}</div>}
            </section>
          ))}
        </div>
      )}

      {templates && (
        <div className="grid" style={{ '--min': '260px', alignItems: 'stretch' } as CSSProperties}>
          {TEMPLATES.map((t) => (
            <article key={t.key} className="card idea-card template-card">
              <span className="chip chip-neutral" style={{ alignSelf: 'flex-start' }}>{TEMPLATE_KINDS[t.kind]}</span>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <p className="small muted" style={{ margin: 0, flex: 1 }}>{t.when}</p>
              <Link href={`/app/posts/new?template=${t.key}`} className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>使用範本</Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
