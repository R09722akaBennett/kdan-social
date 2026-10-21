import { aiConfigured, getConversation, listAccounts, listConversations } from '@kdan-social/core';
import { Fragment, type ReactNode } from 'react';
import { AskForm } from '@/components/ask-form';
import { EmptyState, Icon, Pf, zoneName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { deleteConversationAction } from '@/app/app/actions';

const SUGGESTIONS = ['把近 7 天的成效整理成給主管的 5 句話', '哪一種貼文的互動最好？', '接下來兩週還有哪些貼文在等審核？', '幫我排下週的貼文，每個帳號 3 篇'];

/** `**bold**` inside a line, the one bit of Markdown models use everywhere. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong> : part));
}

/** The assistant's prose: blank-line paragraphs, and "- " or "1. " lines as lists. */
function Prose({ text }: { text: string }) {
  const bullet = /^\s*([-*•]|\d+[.)])\s+/;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {text.split(/\n{2,}/).map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => bullet.test(l))) {
          const List = /^\s*\d/.test(lines[0]!) ? 'ol' : 'ul';
          return <List key={i} className="stack" style={{ gap: 4, margin: 0, paddingLeft: 20 }}>{lines.map((l, j) => <li key={j}>{inline(l.replace(bullet, ''))}</li>)}</List>;
        }
        return <p key={i} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && '\n'}{inline(l.replace(/^#+\s*/, ''))}</Fragment>)}</p>;
      })}
    </div>
  );
}

function bucket(at: Date, now: Date) {
  const days = (now.getTime() - at.getTime()) / 86_400_000;
  return days < 1 ? '今天' : days < 7 ? '近 7 天' : '更早';
}

/**
 * Chat with the workspace's data, after Customer.io's agent page and Otter's chat
 * history: past conversations on the left, the thread and a message box on the right,
 * and Deel's opening prompt with suggestions when nothing has been asked yet.
 */
export default async function Assistant({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { user, workspace } = await requireWorkspace();
  const { c } = await searchParams;
  const db = getDb();
  const ids = { workspaceId: workspace.id, userId: user.id };
  const [list, thread, accounts] = await Promise.all([
    listConversations(db, ids),
    c ? getConversation(db, { ...ids, id: c }) : null,
    listAccounts(db, workspace.id),
  ]);
  const now = new Date();
  const byId = new Map(accounts.map((a) => [a.id, a]));

  if (!aiConfigured()) {
    return (
      <main className="main">
        <header className="page-head"><div><h1>AI 助理</h1></div></header>
        <section className="card"><EmptyState icon="spark" title="這個環境還沒有設定 AI">請管理員設定 AI 模型後再使用。</EmptyState></section>
      </main>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, minHeight: '100vh' }}>
      <nav aria-label="對話紀錄" style={{ flex: '1 1 220px', maxWidth: 260, padding: '20px 12px', borderRight: '1px solid var(--line)', background: '#FAFBFC', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <a className="btn" href="/app/assistant" style={{ marginBottom: 10 }}><Icon name="plus" size={16} />新對話</a>
        {list.length === 0 && <div className="tiny muted" style={{ padding: '4px 8px' }}>還沒有對話。</div>}
        {list.map((x, i) => (
          <Fragment key={x.id}>
            {(i === 0 || bucket(list[i - 1]!.updatedAt, now) !== bucket(x.updatedAt, now)) && <div className="tiny muted" style={{ padding: '10px 8px 4px' }}>{bucket(x.updatedAt, now)}</div>}
            <a href={`/app/assistant?c=${x.id}`} aria-current={x.id === c ? 'page' : undefined} className="small"
              style={{ padding: '8px 10px', borderRadius: 8, color: x.id === c ? 'var(--ink)' : 'var(--ink-2)', background: x.id === c ? 'var(--line-soft)' : 'transparent', fontWeight: x.id === c ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {x.title}
            </a>
          </Fragment>
        ))}
      </nav>

      <main className="main" style={{ flex: '999 1 480px' }}>
        <header className="row" style={{ gap: 10 }}>
          <h1 style={{ fontSize: 20, flex: 1, minWidth: 0 }}>{thread?.conversation.title ?? 'AI 助理'}</h1>
          {thread && (
            <form action={deleteConversationAction}>
              <input type="hidden" name="id" value={thread.conversation.id} />
              <button type="submit" className="btn btn-sm">刪除對話</button>
            </form>
          )}
        </header>
        <div className="tiny muted" style={{ marginTop: -8 }}>AI 只讀這個工作區的資料；規劃的貼文要你按「開新貼文」看過再排程，它不會自行發布。對話只有你看得到。</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 880, width: '100%' }}>
          {c && !thread && <div className="alert" role="alert"><div className="body">找不到這段對話，可能已經刪除。</div></div>}
          {!c && (
            <div style={{ textAlign: 'center', padding: '48px 0 8px' }}>
              <span className="ai-avatar" aria-hidden="true" style={{ margin: '0 auto 10px', width: 40, height: 40 }}><Icon name="spark" size={20} /></span>
              <h2 style={{ fontSize: 22 }}>想知道什麼？</h2>
              <div className="small muted" style={{ marginTop: 6 }}>問 {workspace.name} 的成效、請它規劃下週的貼文，或寫一篇初稿。</div>
            </div>
          )}
          {thread?.messages.map((m) => (m.role === 'user' ? (
            <div key={m.id} className="bubble-me" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          ) : (
            <div key={m.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
              <span className="ai-avatar" aria-hidden="true"><Icon name="spark" size={16} /></span>
              <div className="stack" style={{ flex: 1, minWidth: 0, gap: 10 }}>
                <Prose text={m.content} />
                {m.plan && m.plan.length > 0 && (
                  <div className="card table-wrap">
                    <table style={{ minWidth: 640 }}>
                      <thead><tr><th>帳號時區的時間</th><th>帳號</th><th>主題與初稿</th><th><span className="sr-only">動作</span></th></tr></thead>
                      <tbody>
                        {m.plan.map((p, i) => {
                          const accs = p.accountIds.map((id) => byId.get(id)).filter((a) => !!a);
                          const zones = [...new Set(accs.map((a) => zoneName(a.timeZone)))].join('、');
                          return (
                            <tr key={i}>
                              <td className="num" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{p.date.slice(5).replace('-', '/')} {p.time}<div className="tiny muted">{zones}</div></td>
                              <td style={{ verticalAlign: 'top' }}>{accs.map((a) => <div key={a.id} className="row small" style={{ gap: 6, flexWrap: 'nowrap' }}><Pf pf={a.platform} size="sm" />{a.name}</div>)}</td>
                              <td style={{ verticalAlign: 'top' }}>
                                <div style={{ fontWeight: 500 }}>{p.topic}</div>
                                <div className="small" style={{ color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.body}</div>
                              </td>
                              <td style={{ verticalAlign: 'top' }}><a className="btn btn-sm" href={`/app/posts/new?plan=${m.id}&item=${i}`} style={{ whiteSpace: 'nowrap' }}>開新貼文</a></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )))}
        </div>

        <div style={{ marginTop: 'auto', maxWidth: 880, width: '100%', position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0 16px', boxShadow: '0 -12px 12px -12px rgba(20,24,30,.12)' }}>
          <AskForm conversation={thread?.conversation.id} suggestions={thread ? [] : SUGGESTIONS} />
        </div>
      </main>
    </div>
  );
}
