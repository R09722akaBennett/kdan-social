import { listMarkets } from '@kdan-social/core';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { connectLineAccount } from '../../actions';

export default async function ConnectLine({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { workspace } = await requireWorkspace();
  const { error } = await searchParams;
  const markets = await listMarkets(getDb(), workspace.id);
  const tw = markets.find((m) => m.code === 'TW');
  return (
    <main className="main" style={{ maxWidth: 720, margin: '0 auto' }}>
      <header>
        <h1>連結 LINE 官方帳號</h1>
        <div className="sub">LINE 沒有一鍵登入，要從 LINE Developers 複製 Messaging API channel 的兩個值。</div>
      </header>
      <section className="card card-pad stack">
        <h2>取得 Channel ID 與 Channel secret</h2>
        <ol className="small stack" style={{ gap: 4, color: 'var(--ink-2)' }}>
          <li>到 LINE Official Account Manager → 設定 → Messaging API，若還沒啟用，按「啟用 Messaging API」並選擇 provider。</li>
          <li>到 LINE Developers（developers.line.biz）→ 選同一個 provider → 點這個官方帳號的 Messaging API channel。</li>
          <li>在「Basic settings」分頁複製 <strong>Channel ID</strong> 與 <strong>Channel secret</strong>。</li>
        </ol>
        <p className="tiny muted" style={{ margin: 0 }}>我們只會群發訊息與讀取額度、好友數，不需要設定 webhook，不會影響這個官方帳號現有的聊天機器人。</p>
      </section>
      <form action={connectLineAccount} className="card card-pad stack">
        <div className="field">
          <label htmlFor="market">市場</label>
          <select id="market" name="marketId" className="select" defaultValue={tw?.id}>
            {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cid">Channel ID</label>
          <input id="cid" name="channelId" className="input" inputMode="numeric" required autoComplete="off" placeholder="例：2001234567" />
        </div>
        <div className="field">
          <label htmlFor="csec">Channel secret</label>
          <input id="csec" name="channelSecret" type="password" className="input" required autoComplete="off" />
          <span className="tiny muted">會先向 LINE 驗證，正確才保存；保存時加密，畫面上不再顯示。</span>
        </div>
        {error && <p className="small" style={{ color: 'var(--err)', margin: 0 }} role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <a className="btn" href="/app">取消</a>
          <button className="btn btn-primary" type="submit">驗證並連結</button>
        </div>
      </form>
    </main>
  );
}
