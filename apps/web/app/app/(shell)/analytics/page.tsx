import { requireWorkspace } from '@/lib/auth';

export default async function Page() {
  await requireWorkspace();
  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>成效</h1>
          <div className="sub">各帳號的粉絲數與貼文成效，可以依群組篩選。</div>
        </div>
      </header>
      <div className="card card-pad stack" style={{ gap: 6 }}>
        <strong>這一頁正在依原型開發中</strong>
        <span className="small muted">完成前不會顯示示意資料，以免和真實資料混淆。</span>
      </div>
    </main>
  );
}
