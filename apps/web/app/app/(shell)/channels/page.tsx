import { followerStats, formatInZone, globalPublishingEnabled, lineClient, lineUsage, listAccounts, listMarkets, loadKey, publishingAllowed } from '@kdan-social/core';
import type { CSSProperties } from 'react';
import { langName, Mk, Pf, PLATFORM, fmtN } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { queueTest } from '@/app/app/actions';

const KIND = { facebook: 'Facebook 粉專', instagram: 'Instagram 商業帳號', line: 'LINE 官方帳號' } as const;

export default async function Channels() {
  const { workspace } = await requireWorkspace();
  const db = getDb();
  const [markets, accounts, followers, usage] = await Promise.all([
    listMarkets(db, workspace.id),
    listAccounts(db, workspace.id),
    followerStats(db, workspace.id),
    lineUsage(db, loadKey(), lineClient(), { workspaceId: workspace.id }),
  ]);
  const live = publishingAllowed(globalPublishingEnabled(), workspace);

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>市場與帳號</h1>
          <div className="sub">{workspace.name} 的帳號依市場分組。每個市場有自己的語言與時區。</div>
        </div>
      </header>

      {markets.map((m) => (
        <section key={m.id} className="card" aria-labelledby={`h-${m.code}`} style={{ overflow: 'hidden' }}>
          <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', gap: '8px 16px' }}>
            <Mk code={m.code} dark />
            <h2 id={`h-${m.code}`}>{m.name}</h2>
            <span className="small" style={{ color: 'var(--ink-2)' }}>{langName(m.locale)} · {m.timeZone}</span>
            <span className="small" style={{ color: 'var(--ink-2)' }}>審核：{m.requiresReview ? '編輯者的貼文需擁有者或管理員核准' : '不需審核'}</span>
          </div>
          {accounts.filter((a) => a.marketId === m.id).length === 0 && <div className="list-row small muted">這個市場還沒有連結帳號。</div>}
          {accounts.filter((a) => a.marketId === m.id).map((a) => {
            const expired = a.status !== 'active';
            const f = followers.get(a.id);
            const u = a.platform === 'line' ? usage.find((x) => x.accountId === a.id) : undefined;
            const used = u?.quota?.limit ? Math.round((u.quota.used / u.quota.limit) * 100) : null;
            const status = expired ? { label: '授權失效', color: 'var(--err)', detail: a.statusDetail ?? '請重新連結。' }
              : u?.error ? { label: '讀不到用量', color: 'var(--warn)', detail: u.error }
              : used !== null && used > 50 ? { label: `本月額度已用 ${used}%`, color: 'var(--warn)', detail: `剩 ${fmtN(u!.quota!.limit! - u!.quota!.used)} 則；每月 1 日重置` }
              : { label: '正常', color: 'var(--ok)', detail: u?.quota ? `本月已用 ${fmtN(u.quota.used)}${u.quota.limit != null ? ` / ${fmtN(u.quota.limit)}` : ''} 則` : a.lastCheckedAt ? `${formatInZone(a.lastCheckedAt, 'Asia/Taipei')} 檢查過，授權有效` : '已連結' };
            const count = a.platform === 'line' ? (u?.audience ? `好友 ${fmtN(u.audience.followers)}（可觸及 ${fmtN(u.audience.targetedReaches)}）` : '好友數隔天才有資料') : f ? `追蹤 ${fmtN(f.followers)}` : '追蹤數明天起顯示';
            return (
              <div key={a.id} className="list-row" style={{ background: expired ? '#FFFAF9' : '#fff' }}>
                <Pf pf={a.platform} size="lg" />
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="small muted">{KIND[a.platform]} · {count}</div>
                </div>
                <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="row small" style={{ gap: 6, fontWeight: 500, color: status.color }}><span className="dot" style={{ background: status.color }} />{status.label}</span>
                  <span className="tiny" style={{ color: 'var(--ink-2)' }}>{status.detail}</span>
                  {used !== null && (
                    <span role="img" aria-label={`本月訊息額度已用 ${used}%`} style={{ height: 6, borderRadius: 3, background: 'var(--line-soft)', overflow: 'hidden', maxWidth: 240, display: 'block' }}>
                      <span style={{ display: 'block', height: 6, width: `${Math.min(used, 100)}%`, background: used > 50 ? 'var(--warn-bar)' : 'var(--ok)' }} />
                    </span>
                  )}
                </div>
                {expired
                  ? <a className="btn btn-danger" href={a.platform === 'line' ? '/app/connect/line' : '/api/meta/connect'}>重新連結</a>
                  : !live && (
                    <form action={queueTest}>
                      <input type="hidden" name="accountId" value={a.id} />
                      <button className="btn btn-sm" type="submit" title={`排一則只會記錄為 dry-run 的 ${PLATFORM[a.platform].name} 測試貼文`}>送一則測試 dry-run</button>
                    </form>
                  )}
              </div>
            );
          })}
        </section>
      ))}

      <section className="stack" aria-labelledby="h-add">
        <h2 id="h-add">新增帳號</h2>
        <div className="grid" style={{ '--min': '300px' } as CSSProperties}>
          <div className="card card-pad stack" style={{ gridColumn: '1 / -1' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Facebook 粉專＋Instagram</div>
              <div className="small" style={{ color: 'var(--ink-2)' }}>用 Facebook 登入一次，就能把各市場的粉專一起帶進來；粉專綁定的 IG 商業帳號會跟著加入。</div>
            </div>
            <a className="btn" href="/api/meta/connect" style={{ alignSelf: 'flex-start', background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600, minHeight: 44 }}>用 Facebook 繼續</a>
          </div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>只連 Instagram</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>目前請把 IG 商業帳號綁定到 Facebook 粉專，再用上面的 Facebook 登入一起加入。</div>
          </div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>LINE 官方帳號</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>台灣和日本的 LINE 是不同的官方帳號，各自貼一組 Messaging API 憑證。</div>
            <a className="btn" href="/app/connect/line" style={{ minHeight: 44, fontWeight: 600 }}>貼上 channel 憑證</a>
          </div>
        </div>
        <div className="small muted">不支援：Facebook 個人頁、Facebook 社團、Instagram 個人帳號（平台沒有開放發文 API）；LINE VOOM 貼文。</div>
      </section>
    </main>
  );
}
