import { loadKey, pendingMetaConnect } from '@kdan-social/core';
import { redirect } from 'next/navigation';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { saveMetaConnection } from '@/app/app/actions';

export default async function ConnectMeta({ searchParams }: { searchParams: Promise<{ session?: string; error?: string }> }) {
  const { user, workspace } = await requireWorkspace();
  const { session, error } = await searchParams;
  if (!session) redirect('/app');
  const pages = await pendingMetaConnect(getDb(), loadKey(), { sessionId: session, workspaceId: workspace.id, userId: user.id });
  if (!pages) redirect('/app?notice=meta_expired');

  return (
    <main className="main" style={{ maxWidth: 820, margin: '0 auto' }}>
      <header>
        <h1>選擇要加入的粉專</h1>
        <div className="sub">以下是你在 Facebook 授權畫面勾選的粉專。加入後可以在「帳號與群組」把它們分進群組、設定時區；粉專有綁定 Instagram 商業帳號的話，可以一起加入。</div>
      </header>
      {error === 'none' && <p className="small" style={{ color: 'var(--err)' }}>請至少勾選一個粉專。</p>}
      <form action={saveMetaConnection} className="card">
        <input type="hidden" name="session" value={session} />
        {pages.map((p) => (
          <div key={p.id} className="list-row">
            <input id={`page-${p.id}`} type="checkbox" name="page" value={p.id} defaultChecked style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
            <label htmlFor={`page-${p.id}`} style={{ flex: '1 1 240px', minWidth: 0, cursor: 'pointer' }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="tiny muted">粉專 ID {p.id}</div>
            </label>
            {p.instagram
              ? <label className="row small" style={{ cursor: 'pointer' }}><input type="checkbox" name={`ig:${p.id}`} defaultChecked style={{ accentColor: 'var(--accent)' }} />一起加入 IG @{p.instagram.username}</label>
              : <span className="tiny muted">沒有綁定 IG 商業帳號</span>}
          </div>
        ))}
        <div className="row" style={{ padding: '14px 18px', justifyContent: 'flex-end' }}>
          <a className="btn" href="/app">取消</a>
          <button className="btn btn-primary" type="submit">加入勾選的帳號</button>
        </div>
      </form>
      <p className="tiny muted">授權結果保留 15 分鐘，逾時請重新連結。權杖會加密保存，不會顯示在畫面上。</p>
    </main>
  );
}
