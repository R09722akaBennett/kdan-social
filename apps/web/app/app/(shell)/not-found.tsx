import Link from 'next/link';
import { EmptyState } from '@/components/ui';

/** What `notFound()` shows inside the app, after Height's: the sidebar stays, one way back. */
export default function NotFound() {
  return (
    <main className="main">
      <div className="card" style={{ marginTop: 48 }}>
        <EmptyState icon="alert" title="找不到這個頁面" action={<Link href="/app" className="btn btn-primary">回到總覽</Link>}>
          它可能已經被刪除、移到別的工作區，或是連結打錯了。
        </EmptyState>
      </div>
    </main>
  );
}
