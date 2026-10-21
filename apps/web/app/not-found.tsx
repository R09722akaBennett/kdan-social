import Link from 'next/link';

/** Any unknown address outside the app, after Mercor's: what happened and where to go. */
export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, textAlign: 'center' }}>
      <span className="brand-mark" aria-hidden="true">K</span>
      <h1 style={{ marginTop: 8 }}>找不到這個頁面</h1>
      <p className="small muted" style={{ margin: 0 }}>連結可能打錯了，或這個頁面已經不存在。</p>
      <Link href="/app" className="btn btn-primary" style={{ marginTop: 8 }}>回到 kdan-social</Link>
    </main>
  );
}
