import { zoneOptions } from '@/components/ui';
import { createWorkspaceAction } from '@/app/app/actions';

/**
 * The create-workspace card, after Base44's "Create a Workspace".
 *
 * Args:
 *   from: the page to come back to with the error when creation is refused.
 */
export function CreateWorkspaceForm({ from }: { from: '/app' | '/app/workspaces/new' }) {
  return (
    <form action={createWorkspaceAction} className="card card-pad stack" style={{ gap: 14 }}>
      <input type="hidden" name="from" value={from} />
      <div className="field">
        <label htmlFor="ws-name">工作區名稱</label>
        <input id="ws-name" name="name" className="input" required maxLength={60} placeholder="例如：品牌或公司名稱" autoFocus />
      </div>
      <div className="field">
        <label htmlFor="ws-tz">時區</label>
        <select id="ws-tz" name="timeZone" className="select" defaultValue="Asia/Taipei">
          {zoneOptions().map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
        </select>
        <span className="tiny muted">頁面上的時間以這個時區顯示，新連結的帳號也先用它；之後每個帳號可以各自調整。</span>
      </div>
      <div className="field">
        <label htmlFor="ws-code">邀請碼</label>
        <input id="ws-code" name="code" className="input" required autoComplete="off" />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary">建立工作區</button>
      </div>
    </form>
  );
}
