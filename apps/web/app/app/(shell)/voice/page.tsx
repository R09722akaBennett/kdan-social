import { requireWorkspace } from '@/lib/auth';

export default async function Page() {
  await requireWorkspace();
  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>品牌語氣</h1>
          <div className="sub">AI 寫文案、改寫、在地化時都照這裡。品牌設定套用到所有帳號；群組可以再疊加自己的規則（選填）。</div>
        </div>
      </header>
      <div className="card card-pad stack" style={{ gap: 6 }}>
        <strong>這一頁正在依原型開發中</strong>
        <span className="small muted">完成前不會顯示示意資料，以免和真實資料混淆。</span>
      </div>
    </main>
  );
}
