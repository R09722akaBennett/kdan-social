import { requireWorkspace } from '@/lib/auth';

export default async function Page() {
  await requireWorkspace();
  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>AI 助理</h1>
          <div className="sub">問成效、請它排一個月的內容、或改寫一篇貼文。產生的貼文一律存成草稿。</div>
        </div>
      </header>
      <div className="card card-pad stack" style={{ gap: 6 }}>
        <strong>這一頁正在依原型開發中</strong>
        <span className="small muted">完成前不會顯示示意資料，以免和真實資料混淆。</span>
      </div>
    </main>
  );
}
