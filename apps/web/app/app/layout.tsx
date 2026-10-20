import type { ReactNode } from 'react';
import { signOut } from './actions';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="row" style={{ padding: '10px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', gap: 16 }}>
        <a href="/app" className="brand" style={{ padding: 0, color: 'var(--ink)' }}><span className="brand-mark">K</span>kdan-social</a>
        <nav className="row" aria-label="主選單" style={{ gap: 4 }}>
          <a className="btn btn-sm" style={{ border: 0 }} href="/app">總覽</a>
          <a className="btn btn-sm" style={{ border: 0 }} href="/app/posts">貼文</a>
        </nav>
        <div className="row spacer">
          <a className="btn btn-sm btn-primary" href="/app/posts/new">新增貼文</a>
          <form action={signOut}><button className="btn btn-sm" type="submit">登出</button></form>
        </div>
      </header>
      {children}
    </>
  );
}
