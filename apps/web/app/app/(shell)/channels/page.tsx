import { followerStats, formatInZone, globalPublishingEnabled, lineClient, lineUsage, listAccounts, listGroups, loadKey, publishingAllowed } from '@kdan-social/core';
import type { CSSProperties } from 'react';
import { DeleteGroupButton, FilterMenu, GroupDialogButton, TimeZoneSelect } from '@/components/groups';
import { EmptyState, GroupTag, Pf, PLATFORM, fmtN, zoneOptions } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { deleteGroupAction, queueTest, saveGroupAction, setTimeZoneAction } from '@/app/app/actions';
import { NoticeToast } from '@/components/toast';
import { ConnectDialog } from '@/components/connect-dialog';

const KIND = { facebook: 'Facebook 粉專', instagram: 'Instagram 商業帳號', line: 'LINE 官方帳號' } as const;

export default async function Channels({ searchParams }: { searchParams: Promise<{ group?: string | string[]; notice?: string; error?: string }> }) {
  const { workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const filter = [sp.group ?? []].flat();
  const db = getDb();
  const [groups, accounts, followers, usage] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    followerStats(db, workspace.id),
    lineUsage(db, loadKey(), lineClient(), { workspaceId: workspace.id }),
  ]);
  const live = publishingAllowed(globalPublishingEnabled(), workspace);
  const manager = role === 'owner' || role === 'admin';
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;
  const shown = accounts.filter((a) => filter.length === 0 || filter.includes(a.groupId ?? 'none'));
  const dialogAccounts = accounts.map(({ id, name, platform, groupId }) => ({ id, name, platform, groupId }));

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>帳號與群組</h1>
          <div className="sub">連結的社群帳號，以及你自己分的群組。群組讓你發文時一鍵選取一組帳號。</div>
        </div>
        <ConnectDialog className="btn btn-primary">連結新帳號</ConnectDialog>
      </header>

      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}
      {sp.notice && <NoticeToast text={sp.notice} />}

      <section className="card" aria-labelledby="h-accounts" style={{ overflow: 'visible' }}>
        <div className="card-head">
          <h2 id="h-accounts">帳號 <span className="small muted">{accounts.length}</span></h2>
          <FilterMenu label="群組" options={[...groups.map((g) => ({ id: g.id, label: g.name })), { id: 'none', label: '未分組' }]} />
        </div>
        {accounts.length === 0 && (
          <EmptyState icon="link" title="還沒有連結帳號">
            從下方選一個平台開始。連結 Facebook 粉專、Instagram 商業帳號或 LINE 官方帳號後，就能排程發文、看成效。
          </EmptyState>
        )}
        {shown.map((a) => {
          const expired = a.status !== 'active';
          const f = followers.get(a.id);
          const u = a.platform === 'line' ? usage.find((x) => x.accountId === a.id) : undefined;
          const used = u?.quota?.limit ? Math.round((u.quota.used / u.quota.limit) * 100) : null;
          const status = expired ? { label: '授權失效', color: 'var(--err)', detail: a.statusDetail ?? '請重新連結。' }
            : u?.error ? { label: '讀不到用量', color: 'var(--warn)', detail: u.error }
            : used !== null && used > 50 ? { label: `本月額度已用 ${used}%`, color: 'var(--warn)', detail: `剩 ${fmtN(u!.quota!.limit! - u!.quota!.used)} 則；每月 1 日重置` }
            : { label: '正常', color: 'var(--ok)', detail: u?.quota ? `本月已用 ${fmtN(u.quota.used)}${u.quota.limit != null ? ` / ${fmtN(u.quota.limit)}` : ''} 則` : a.lastCheckedAt ? `${formatInZone(a.lastCheckedAt, workspace.timeZone)} 檢查過，授權有效` : '已連結' };
          const count = a.platform === 'line' ? (u?.audience ? `好友 ${fmtN(u.audience.followers)}（可觸及 ${fmtN(u.audience.targetedReaches)}）` : '好友數隔天才有資料') : f ? `追蹤 ${fmtN(f.followers)}` : '追蹤數明天起顯示';
          return (
            <div key={a.id} className="list-row" style={{ background: expired ? '#FFFAF9' : '#fff' }}>
              <Pf pf={a.platform} size="lg" />
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}><span style={{ fontWeight: 600 }}>{a.name}</span><GroupTag name={groupName(a.groupId)} /></div>
                <div className="small muted">{KIND[a.platform]} · {count}</div>
              </div>
              {manager
                ? <TimeZoneSelect accountId={a.id} accountName={a.name} value={a.timeZone} options={zoneOptions(a.timeZone)} action={setTimeZoneAction} />
                : <span className="small" style={{ color: 'var(--ink-2)' }}>時區 {zoneOptions(a.timeZone).find((z) => z.id === a.timeZone)?.label}</span>}
              <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="row small" style={{ gap: 6, fontWeight: 500, color: status.color }}><span className="dot" style={{ background: status.color }} />{status.label}</span>
                <span className="tiny" style={{ color: 'var(--ink-2)' }}>{status.detail}</span>
                {used !== null && (
                  <span role="img" aria-label={`本月訊息額度已用 ${used}%`} style={{ height: 6, borderRadius: 3, background: 'var(--line-soft)', overflow: 'hidden', maxWidth: 200, display: 'block' }}>
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

      <section className="card" aria-labelledby="h-groups" id="groups">
        <div className="card-head">
          <div>
            <h2 id="h-groups">群組</h2>
            <div className="small muted">把常一起發文的帳號放在一起，名稱由你決定（國家、子品牌、門市都可以）。一個帳號只會在一個群組裡。</div>
          </div>
          {manager && <GroupDialogButton groups={groups} accounts={dialogAccounts} action={saveGroupAction} />}
        </div>
        {groups.length === 0 && <div className="list-row small muted">還沒有群組。不分組也能正常發文。</div>}
        {groups.map((g) => {
          const list = accounts.filter((a) => a.groupId === g.id);
          return (
            <div key={g.id} className="list-row">
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="row" style={{ gap: 4, marginTop: 4 }}>
                  {list.length === 0 && <span className="tiny muted">沒有帳號</span>}
                  {list.map((a) => <span key={a.id} className="row tiny muted" style={{ gap: 4, marginRight: 8 }}><Pf pf={a.platform} size="sm" />{a.name}</span>)}
                </div>
              </div>
              {manager && <GroupDialogButton group={{ id: g.id, name: g.name }} groups={groups} accounts={dialogAccounts} action={saveGroupAction} />}
              {manager && <DeleteGroupButton group={{ id: g.id, name: g.name }} action={deleteGroupAction} />}
            </div>
          );
        })}
      </section>

      <section className="stack" aria-labelledby="h-add" id="add">
        <h2 id="h-add">連結新帳號</h2>
        <div className="grid" style={{ '--min': '300px' } as CSSProperties}>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Facebook 粉專＋Instagram</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>用 Facebook 登入一次，勾選要加入的粉專；粉專綁定的 IG 商業帳號會跟著加入。</div>
            <a className="btn" href="/app/connect/facebook" style={{ background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600, minHeight: 44 }}>連結 Facebook</a>
          </div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 600 }}>LINE 官方帳號</div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>每個官方帳號各自貼一組 Messaging API 憑證。</div>
            <a className="btn" href="/app/connect/line" style={{ minHeight: 44, fontWeight: 600 }}>貼上 channel 憑證</a>
          </div>
        </div>
        <div className="small muted">不支援：Facebook 個人頁、Facebook 社團、Instagram 個人帳號（平台沒有開放發文 API）；LINE VOOM 貼文。</div>
      </section>
    </main>
  );
}
