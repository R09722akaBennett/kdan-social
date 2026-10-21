import { aiConfigured, aiUsage, globalPublishingEnabled, modelFor, publishingAllowed } from '@kdan-social/core';
import { fmtN, zoneOptions } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { linkFacebookAction, togglePublishing, updateSettingsAction } from '@/app/app/actions';
import { supabaseServer } from '@/lib/supabase';

// Sections after Buffer's General settings: one card per concern, each saved on its own.
export default async function Settings({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const manager = role === 'owner' || role === 'admin';
  const live = publishingAllowed(globalPublishingEnabled(), workspace);
  const [usage, auth] = await Promise.all([aiUsage(getDb(), { workspaceId: workspace.id, days: 30 }), (await supabaseServer()).auth.getUser()]);
  const identities = auth.data.user?.identities ?? [];
  const facebook = identities.find((i) => i.provider === 'facebook');
  const fbName = typeof facebook?.identity_data?.name === 'string' ? facebook.identity_data.name : null;
  const fbEmail = typeof facebook?.identity_data?.email === 'string' ? facebook.identity_data.email : null;

  return (
    <main className="main" style={{ maxWidth: 860 }}>
      <header className="page-head">
        <div>
          <h1>設定</h1>
          <div className="sub">{workspace.name} 的工作區設定。{manager ? '' : '只有擁有者或管理員可以修改。'}</div>
        </div>
      </header>
      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}
      {sp.notice && <div className="card card-pad small" role="status">{sp.notice}</div>}

      <form action={updateSettingsAction} className="card card-pad stack" style={{ gap: 14 }} aria-labelledby="h-general">
        <h2 id="h-general">工作區</h2>
        <div className="field">
          <label htmlFor="name">名稱</label>
          <input id="name" name="name" className="input" defaultValue={workspace.name} maxLength={60} disabled={!manager} required />
        </div>
        <div className="field">
          <label htmlFor="tz">顯示時區</label>
          <select id="tz" name="timeZone" className="select" defaultValue={workspace.timeZone} disabled={!manager}>
            {zoneOptions(workspace.timeZone).map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
          <span className="tiny muted">總覽、行事曆、成效的時間以這個時區顯示，新連結的帳號也先用它。已連結的帳號各自的時區在「帳號與群組」調整。</span>
        </div>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap', cursor: manager ? 'pointer' : 'default' }}>
          <input type="checkbox" name="requiresReview" defaultChecked={workspace.requiresReview} disabled={!manager} style={{ accentColor: 'var(--accent)', marginTop: 3, width: 18, height: 18 }} />
          <span>
            <span style={{ display: 'block', fontWeight: 600 }}>編輯送出的貼文要核准</span>
            <span className="small muted">開啟時，編輯的貼文要擁有者或管理員在「待審核」核准才會發出；關閉時直接排程。</span>
          </span>
        </label>
        {manager && <div className="row" style={{ justifyContent: 'flex-end' }}><button type="submit" className="btn btn-primary">儲存</button></div>}
      </form>

      <section id="publishing" className="card card-pad stack" style={{ gap: 12, borderColor: live ? 'var(--err-line)' : 'var(--line)' }} aria-labelledby="h-publishing">
        <h2 id="h-publishing">對外發文</h2>
        <div>
          <div style={{ fontWeight: 600 }}>{live ? '開啟：到時間的貼文會真的發出' : '關閉：到時間的貼文只記錄為 dry-run'}</div>
          <div className="small muted">工作區開關：{workspace.publishingEnabled ? '開' : '關'} · 系統總開關：{globalPublishingEnabled() ? '開' : '關（由系統管理員控制）'}。兩個都開才會真的發文。</div>
        </div>
        {role === 'owner' ? (
          <form action={togglePublishing} className="row" style={{ gap: 10 }}>
            <input type="hidden" name="enable" value={workspace.publishingEnabled ? '0' : '1'} />
            {!workspace.publishingEnabled && <label className="row small" style={{ cursor: 'pointer' }}><input type="checkbox" name="confirm" style={{ accentColor: 'var(--err)' }} />我了解開啟後貼文會真的發到粉專與官方帳號</label>}
            <button className={`btn ${workspace.publishingEnabled ? '' : 'btn-danger'}`} type="submit">{workspace.publishingEnabled ? '關閉工作區發文' : '開啟工作區發文'}</button>
          </form>
        ) : <span className="small muted">只有擁有者可以切換。</span>}
      </section>

      <section id="login" className="card" aria-labelledby="h-login">
        <div className="card-head">
          <div>
            <h2 id="h-login">你的登入方式</h2>
            <div className="small muted">只影響你自己的帳號。連結 Facebook 後，用 Email 或 Facebook 登入都會進到同一個帳號和同樣的工作區。</div>
          </div>
        </div>
        <div className="list-row">
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>Email</div>
            <div className="small muted">{auth.data.user?.email}</div>
          </div>
          <span className="small muted">邀請、通知與紀錄都用這個 Email 認你</span>
        </div>
        <div className="list-row">
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>Facebook</div>
            <div className="small muted">{facebook ? [fbName, fbEmail].filter(Boolean).join(' · ') || '已連結' : '還沒有連結'}</div>
          </div>
          {facebook
            ? <span className="chip chip-ok">已連結</span>
            : <form action={linkFacebookAction}><button type="submit" className="btn" style={{ background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600 }}>連結 Facebook</button></form>}
        </div>
      </section>

      <section className="card" aria-labelledby="h-ai">
        <div className="card-head">
          <h2 id="h-ai">AI 用量（近 30 天）</h2>
          <span className="small muted">{aiConfigured() ? `寫文案：${modelFor('write')}　AI 分析：${modelFor('insights')}` : '這個環境還沒有設定 AI'}</span>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 520 }}>
            <thead><tr><th>模型</th><th className="right">次數</th><th className="right">輸入 tokens</th><th className="right">輸出 tokens</th></tr></thead>
            <tbody>
              {usage.length === 0 && <tr><td colSpan={4} className="small muted">近 30 天沒有使用 AI。</td></tr>}
              {usage.map((u) => <tr key={u.model}><td>{u.model}</td><td className="right num">{fmtN(u.requests)}</td><td className="right num">{fmtN(u.input)}</td><td className="right num">{fmtN(u.output)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="tiny muted" style={{ padding: '8px 16px 14px' }}>每個工作區每小時最多 200 次 AI 請求。</div>
      </section>

      <section className="card card-pad row" style={{ gap: 10 }}>
        <span style={{ flex: 1 }}><strong style={{ fontWeight: 600 }}>成員與權限</strong><span className="small muted" style={{ display: 'block' }}>邀請成員、調整角色在「成員」頁。</span></span>
        <a className="btn btn-sm" href="/app/members">前往成員</a>
      </section>
    </main>
  );
}
