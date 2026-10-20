import { lineClient, lineUsage, listAccounts, listMarkets, loadKey } from '@kdan-social/core';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { supabaseEnv } from '@/lib/supabase';
import Composer from './Composer';

export default async function NewPost() {
  const { workspace } = await requireWorkspace();
  const db = getDb();
  const [markets, accounts, usage] = await Promise.all([
    listMarkets(db, workspace.id),
    listAccounts(db, workspace.id),
    lineUsage(db, loadKey(), lineClient(), { workspaceId: workspace.id }),
  ]);
  return (
    <main className="main" style={{ maxWidth: 900, margin: '0 auto' }}>
      <header>
        <h1>新增貼文</h1>
        <div className="sub">寫一次，發到多個市場和平台。</div>
      </header>
      <Composer
        markets={markets.map(({ id, code, name, timeZone }) => ({ id, code, name, timeZone }))}
        accounts={accounts.map(({ id, marketId, platform, name, status }) => ({ id, marketId, platform, name, status }))}
        supabase={supabaseEnv()}
        lineUsage={usage.map(({ accountId, quota, audience, error }) => ({ accountId, quota, audience, error }))}
      />
    </main>
  );
}
