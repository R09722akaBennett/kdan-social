import { IDEA_STATUSES, listIdeas, type IdeaStatus } from '@kdan-social/core';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { deleteIdeaAction, moveIdeaAction, saveIdeaAction } from '@/app/app/actions';
import { ConfirmSubmit } from '@/components/confirm';
import { IdeaDialog } from '@/components/idea-dialog';
import { NoticeToast } from '@/components/toast';
import { Icon } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { TEMPLATE_KINDS, TEMPLATES } from '@/lib/templates';

const COLUMN: Record<IdeaStatus, string> = { unassigned: '未分類', todo: '待辦', in_progress: '進行中', done: '完成' };

/**
 * Where posts start, after Buffer's Create: a board of ideas the workspace shares, and a
 * library of writing prompts. Either one opens the composer with its text.
 */
export default async function Ideas({ searchParams }: { searchParams: Promise<{ tab?: string; notice?: string; error?: string }> }) {
  const [sp, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const templates = sp.tab === 'templates';
  const board = templates ? null : await listIdeas(getDb(), workspace.id);

  return (
    <main className="main">
      {sp.notice && <NoticeToast text={sp.notice} />}
      <header className="page-head">
        <div>
          <h1>點子與範本</h1>
          <div className="sub">先把想法記下來，準備好了再轉成貼文。</div>
        </div>
        {!templates && (
          <IdeaDialog action={saveIdeaAction} idea={{ status: 'unassigned' }} className="btn btn-primary" label="新增點子">
            <Icon name="plus" size={16} stroke={2} />新增點子
          </IdeaDialog>
        )}
      </header>

      <nav className="channel-tabs" aria-label="點子與範本">
        <Link href="/app/ideas" aria-current={templates ? undefined : 'page'}>點子</Link>
        <Link href="/app/ideas?tab=templates" aria-current={templates ? 'page' : undefined}>範本<span className="channel-count num">{TEMPLATES.length}</span></Link>
      </nav>

      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}

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
