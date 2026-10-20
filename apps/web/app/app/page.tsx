import { globalPublishingEnabled, listAccounts, listMarkets, publishingAllowed, recentTasks } from '@kdan-social/core';
import { currentMember } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { queueTest, signOut } from './actions';

const PF: Record<string, string> = { facebook: 'f', instagram: 'IG', line: 'L' };
const STATUS: Record<string, [string, string]> = {
  scheduled: ['plan', '已排程'], running: ['plan', '發送中'], published: ['ok', '已發布'], dry_run: ['neutral', 'dry-run'],
  failed: ['err', '失敗'], needs_check: ['warn', '需人工確認'], missed: ['warn', '未核准，已略過'],
};
const NOTICE: Record<string, [string, string]> = {
  connected: ['ok', '已連結 {n} 個帳號。'],
  test_queued: ['ok', '已排入一則測試貼文，一分鐘內會被處理成 dry-run，重新整理即可看到結果。'],
  test_refused: ['err', '對外發文已開啟，測試貼文會真的發出去，所以沒有排入。'],
  meta_cancelled: ['warn', '你在 Facebook 取消了授權，沒有連結任何帳號。'],
  meta_state: ['err', '授權驗證失敗（可能是連結過期或被竄改），請重新連結。'],
  meta_no_pages: ['warn', 'Facebook 沒有回傳任何粉專。請確認你是粉專管理員，並在授權畫面勾選了粉專。'],
  meta_denied: ['err', 'Facebook 拒絕了授權，請重新連結並允許所有要求的權限。'],
  meta_failed: ['err', '和 Facebook 連線失敗，請稍後再試。'],
  meta_expired: ['err', '這次授權已過期（15 分鐘），請重新連結。'],
};
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) : '—');

export default async function Workspace({ searchParams }: { searchParams: Promise<{ notice?: string; n?: string }> }) {
  const { user, membership } = await currentMember();
  const { notice, n } = await searchParams;

  if (!membership) {
    return (
      <main className="main" style={{ maxWidth: 560, margin: '64px auto' }}>
        <h1>尚未加入任何工作區</h1>
        <p>你以 <strong>{user.email}</strong> 登入，但還沒有被加入工作區。請聯絡管理員把你加進去。</p>
        <form action={signOut}><button className="btn" type="submit">登出</button></form>
      </main>
    );
  }

  const db = getDb();
  const { workspace } = membership;
  const [markets, accounts, tasks] = await Promise.all([listMarkets(db, workspace.id), listAccounts(db, workspace.id), recentTasks(db, workspace.id)]);
  const live = publishingAllowed(globalPublishingEnabled(), workspace);
  const note = notice ? NOTICE[notice] : undefined;

  return (
    <main className="main" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header className="page-head">
        <div>
          <h1>{workspace.name}</h1>
          <div className="sub">{user.email} · {membership.role}</div>
        </div>
        <div className="row">
          <span className={`chip chip-${live ? 'err' : 'neutral'}`} style={{ height: 32 }}>對外發文：{live ? '開啟（會真的發出）' : '關閉（只記錄 dry-run）'}</span>
          <a className="btn btn-primary" href="/api/meta/connect">連結 Facebook 粉專</a>
          <form action={signOut}><button className="btn" type="submit">登出</button></form>
        </div>
      </header>

      {note && <div className={`chip chip-${note[0]}`} role="status" style={{ height: 'auto', padding: '10px 14px', fontSize: 14 }}>{note[1].replace('{n}', n ?? '0')}</div>}

      {markets.map((m) => {
        const list = accounts.filter((a) => a.marketId === m.id);
        return (
          <section key={m.id} className="card" style={{ overflow: 'hidden' }}>
            <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
              <span className="mk dark">{m.code}</span><h2>{m.name}</h2><span className="small muted">{m.timeZone}</span>
            </div>
            {list.length === 0 && <div className="list-row small muted">還沒有連結帳號。</div>}
            {list.map((a) => (
              <div key={a.id} className="list-row" style={{ background: a.status === 'active' ? '#fff' : '#FFFAF9' }}>
                <span className={`pf pf-${a.platform} lg`} aria-label={a.platform}>{PF[a.platform]}</span>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="tiny muted">{a.platform} · {a.externalId}</div>
                </div>
                <div style={{ flex: '1 1 220px' }} className="small">
                  {a.status === 'active'
                    ? <span style={{ color: 'var(--ok)' }}>正常{a.lastCheckedAt ? `（${fmt(a.lastCheckedAt)} 檢查過）` : ''}</span>
                    : <span style={{ color: 'var(--err)' }}>授權失效：{a.statusDetail ?? '請重新連結'}</span>}
                </div>
                {a.status === 'active' && !live && (
                  <form action={queueTest}>
                    <input type="hidden" name="accountId" value={a.id} />
                    <button className="btn btn-sm" type="submit">送一則測試 dry-run</button>
                  </form>
                )}
                {a.status !== 'active' && <a className="btn btn-sm btn-danger" href="/api/meta/connect">重新連結</a>}
              </div>
            ))}
          </section>
        );
      })}

      <section className="card">
        <div className="card-head"><h2>最近的發文任務</h2><span className="tiny muted">時間為台北時間</span></div>
        {tasks.length === 0 && <div className="list-row small muted">還沒有任何任務。</div>}
        {tasks.map((t) => {
          const [tone, label] = STATUS[t.status] ?? ['neutral', t.status];
          return (
            <div key={t.id} className="list-row small">
              <span className="num" style={{ width: 110 }}>{fmt(t.runAt)}</span>
              <span style={{ flex: '1 1 200px' }}>{t.title}</span>
              <span style={{ flex: '1 1 160px' }} className="muted">{t.account}</span>
              <span className={`chip chip-${tone}`}>{label}</span>
              {t.lastError && <span className="tiny" style={{ flexBasis: '100%', color: 'var(--ink-2)' }}>{t.lastError}</span>}
            </div>
          );
        })}
      </section>
    </main>
  );
}
