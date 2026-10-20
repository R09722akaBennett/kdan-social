import { formatInZone, listPosts } from '@kdan-social/core';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';

const STATUS: Record<string, [string, string]> = {
  scheduled: ['plan', '已排程'], running: ['plan', '發送中'], published: ['ok', '已發布'], dry_run: ['neutral', 'dry-run'],
  failed: ['err', '失敗'], needs_check: ['warn', '需人工確認'], missed: ['warn', '未核准，已略過'],
};

function postLink(platform: string, id: string | null) {
  if (!id) return null;
  if (platform === 'facebook') {
    const [page, post] = id.split('_');
    return post ? `https://www.facebook.com/${page}/posts/${post}` : null;
  }
  return null;
}

export default async function Posts({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { workspace } = await requireWorkspace();
  const { created } = await searchParams;
  const list = await listPosts(getDb(), workspace.id);
  return (
    <main className="main" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <header className="page-head">
        <div><h1>貼文</h1><div className="sub">時間以台北時間顯示</div></div>
        <a className="btn btn-primary" href="/app/posts/new">新增貼文</a>
      </header>
      {created && <div className="chip chip-ok" role="status" style={{ height: 'auto', padding: '10px 14px', fontSize: 14 }}>已建立貼文，會在排定的時間由排程發出。</div>}
      {list.length === 0 && <div className="card card-pad muted">還沒有貼文。</div>}
      {list.map((p) => (
        <section key={p.id} className="card">
          <div className="card-head"><h2>{p.title}</h2><span className="tiny muted">建立於 {formatInZone(p.createdAt, 'Asia/Taipei')}</span></div>
          {p.tasks.map((t) => {
            const [tone, label] = STATUS[t.status] ?? ['neutral', t.status];
            const link = postLink(t.platform, t.externalPostId);
            return (
              <div key={t.id} className="list-row small">
                <span className="mk">{t.market}</span>
                <span style={{ flex: '1 1 180px' }}>{t.account}</span>
                <span className="num" style={{ width: 110 }}>{formatInZone(t.runAt, 'Asia/Taipei')}</span>
                {t.review === 'pending' && <span className="chip chip-warn">待審核</span>}
                <span className={`chip chip-${tone}`}>{label}</span>
                {link && <a href={link} target="_blank" rel="noreferrer">看貼文</a>}
                {t.lastError && <span className="tiny" style={{ flexBasis: '100%', color: 'var(--ink-2)' }}>{t.lastError}</span>}
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}
