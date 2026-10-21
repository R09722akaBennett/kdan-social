import { CreateWorkspaceForm } from '@/components/create-workspace';
import { requireWorkspace } from '@/lib/auth';
import { signupCodes } from '@/lib/server';

/** Another workspace for someone who already has one, such as an agency adding a client. */
export default async function NewWorkspace({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await requireWorkspace();
  const { error } = await searchParams;
  return (
    <main className="main" style={{ maxWidth: 560, margin: '0 auto' }}>
      <header>
        <h1>建立新工作區</h1>
        <div className="sub">每個工作區有自己的帳號、貼文、成員與設定，彼此不互通。建立後可以從側欄最上方切換。</div>
      </header>
      {error && <div className="alert" role="alert"><div className="body">{error}</div></div>}
      {signupCodes().length > 0
        ? <CreateWorkspaceForm from="/app/workspaces/new" />
        : <div className="card card-pad small">目前不開放自行建立工作區。要加入其他工作區，請對方的擁有者或管理員邀請 {user.email}。</div>}
    </main>
  );
}
