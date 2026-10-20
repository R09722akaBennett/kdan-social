import { requireWorkspace } from '@/lib/auth';

export default async function Page() {
  await requireWorkspace();
  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>待審核</h1>
          <div className="sub">編輯送出的貼文，由擁有者或管理員核准後才會進排程。一篇貼文核准一次，涵蓋它的所有帳號。</div>
        </div>
      </header>
      <div className="card card-pad stack" style={{ gap: 6 }}>
        <strong>這一頁正在依原型開發中</strong>
        <span className="small muted">完成前不會顯示示意資料，以免和真實資料混淆。</span>
      </div>
    </main>
  );
}
