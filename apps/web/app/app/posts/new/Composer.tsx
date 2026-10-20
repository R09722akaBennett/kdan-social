'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useActionState, useMemo, useState, type CSSProperties } from 'react';
import { clockInZone, dayInZone, zonedTimeToUtc } from '@kdan-social/core/time';
import { Icon, Pf, PLATFORM, zoneName, type Platform } from '@/components/ui';
import { createImageUpload, submitPost, type SubmitState } from '../actions';

type Group = { id: string; name: string };
type Account = { id: string; groupId: string | null; timeZone: string; platform: Platform; name: string; status: string };
type LineUsage = { accountId: string; quota: { limit: number | null; used: number } | null; audience: { followers: number; targetedReaches: number } | null; error: string | null };
type Media = { url: string; previewUrl: string; alt: string; ratio: number; name: string };
type Tone = 'ok' | 'err' | 'warn' | 'info';

const IG_MAX = 2200;
const LINE_MAX = 5000;
const LINE_IMAGES = 4;
// Instagram rejects feed images narrower than 4:5 or wider than 1.91:1.
const IG_RATIO = [0.8, 1.91] as const;
const MAX_WIDTH = 1440;
// LINE preview images must stay under 1 MB; 640px at this quality is well below it.
const PREVIEW_WIDTH = 640;
const CHECK: Record<Tone, { mark: string; bg: string; fg: string }> = {
  ok: { mark: '✓', bg: 'var(--ok-soft)', fg: 'var(--ok)' },
  err: { mark: '!', bg: 'var(--err-soft)', fg: 'var(--err)' },
  warn: { mark: '?', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  info: { mark: 'i', bg: 'var(--line-soft)', fg: 'var(--ink-2)' },
};

/** Re-encode any browser-readable image as a JPEG; Instagram accepts only JPEG. */
async function toJpeg(file: File, maxWidth = MAX_WIDTH, quality = 0.9): Promise<{ blob: Blob; ratio: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('encode failed');
  return { blob, ratio: bitmap.width / bitmap.height };
}

const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function Composer({ workspace, role, groups, accounts, supabase, lineUsage }: {
  workspace: string; role: string; groups: Group[]; accounts: Account[]; supabase: { url: string; key: string }; lineUsage: LineUsage[];
}) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [main, setMain] = useState('');
  // Text customised for one account; an account without an entry uses the main text.
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [customizing, setCustomizing] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const viewerTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [mode, setMode] = useState<'now' | 'local' | 'same'>('local');
  const [date, setDate] = useState(() => todayIn(viewerTz));
  const [time, setTime] = useState('20:00');
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitPost, {});

  const chosen = accounts.filter((a) => on[a.id]);
  // Same rule as createPost on the server, so the preview shows exactly what is sent.
  const textFor = (id: string) => (custom[id] ?? main).trim();
  const groupState = (g: Group) => {
    const list = accounts.filter((a) => a.groupId === g.id);
    const n = list.filter((a) => on[a.id]).length;
    return n === 0 ? 'none' : n === list.length ? 'all' : 'some';
  };
  const toggleGroup = (g: Group) => {
    const all = groupState(g) === 'all';
    setOn((o) => ({ ...o, ...Object.fromEntries(accounts.filter((a) => a.groupId === g.id).map((a) => [a.id, !all])) }));
  };
  const usedGroups = groups.filter((g) => accounts.some((a) => a.groupId === g.id));

  const checks: Array<{ tone: Tone; title: string; detail: string; href?: string; action?: string }> = [];
  for (const a of chosen) {
    const text = textFor(a.id);
    const who = `${PLATFORM[a.platform].name}「${a.name}」`;
    if (a.status !== 'active') checks.push({ tone: 'err', title: `${who}：授權已失效`, detail: '要先重新連結帳號才能排程。', href: '/app/channels', action: '重新連結' });
    if (a.platform === 'instagram') {
      if (media.length === 0) checks.push({ tone: 'err', title: `${who}：缺少圖片`, detail: 'Instagram 一定要附至少一張圖片。' });
      if (text.length > IG_MAX) checks.push({ tone: 'err', title: `${who}：內文太長`, detail: `最多 ${IG_MAX} 字，目前 ${text.length} 字。` });
      const bad = media.filter((x) => x.ratio < IG_RATIO[0] || x.ratio > IG_RATIO[1]);
      if (bad.length) checks.push({ tone: 'err', title: `${who}：圖片比例不符`, detail: `只接受寬高比 4:5 到 1.91:1，「${bad.map((x) => x.name).join('、')}」超出範圍。` });
    }
    if (a.platform === 'facebook' && !text && media.length === 0) checks.push({ tone: 'err', title: `${who}：沒有內容`, detail: '要有文字或圖片。' });
    if (a.platform === 'line') {
      if (!text && media.length === 0) checks.push({ tone: 'err', title: `${who}：沒有內容`, detail: '要有文字或圖片。' });
      if (text.length > LINE_MAX) checks.push({ tone: 'err', title: `${who}：訊息太長`, detail: `最多 ${LINE_MAX} 字，目前 ${text.length} 字。` });
      if (media.length > LINE_IMAGES) checks.push({ tone: 'err', title: `${who}：圖片太多`, detail: `一次最多 ${LINE_IMAGES} 張，目前 ${media.length} 張。` });
      const u = lineUsage.find((x) => x.accountId === a.id);
      const cost = u?.audience?.targetedReaches ?? null;
      const left = u?.quota?.limit != null ? u.quota.limit - u.quota.used : null;
      if (u?.error) checks.push({ tone: 'warn', title: `${who}：讀不到額度`, detail: u.error });
      else if (cost != null && left != null && cost > left) checks.push({ tone: 'err', title: `${who}：本月訊息額度不夠`, detail: `會群發給 ${cost.toLocaleString('en-US')} 位好友，扣 ${cost.toLocaleString('en-US')} 則，本月只剩 ${left.toLocaleString('en-US')} 則。` });
      else checks.push({ tone: 'info', title: `${who}：會群發給全部好友`, detail: cost == null ? '好友數隔天才有資料，暫時無法預估扣多少則。' : `預估扣 ${cost.toLocaleString('en-US')} 則${left != null ? `，本月剩 ${left.toLocaleString('en-US')} 則` : '（方案沒有上限）'}。每位收到的好友扣 1 則，不論訊息有幾段。` });
    }
  }
  const zones = [...new Set(chosen.map((a) => a.timeZone))];
  if (mode === 'local' && zones.length > 1) checks.push({ tone: 'warn', title: `選到的帳號分在 ${zones.length} 個時區`, detail: `「依各帳號時區」會讓每個帳號在自己的 ${time} 發出（${zones.map(zoneName).join('、')}）。內文若寫了開始時間，讀者會依自己的時區理解。` });
  const blocking = checks.filter((c) => c.tone === 'err').length;
  if (chosen.length && !blocking) checks.unshift({ tone: 'ok', title: `${chosen.length} 個帳號可以發布`, detail: '平台規則都符合。' });
  if (role !== 'owner' && role !== 'admin' && chosen.length) checks.push({ tone: 'info', title: '送出後要等核准', detail: '編輯者送出的貼文，要由擁有者或管理員核准才會發出。' });

  async function upload(files: FileList | null) {
    if (!files) return;
    setUploadError('');
    const client = createBrowserClient(supabase.url, supabase.key);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const { blob, ratio } = await toJpeg(file);
        if (blob.size > 8 * 1024 * 1024) throw new Error('too large');
        const { blob: preview } = await toJpeg(file, PREVIEW_WIDTH, 0.8);
        const [target, previewTarget] = await Promise.all([createImageUpload(), createImageUpload()]);
        // Storage takes the type from the Blob itself and ignores `contentType`; the bucket
        // accepts only image/jpeg, so this relies on toBlob having typed it.
        const { error } = await client.storage.from('media').uploadToSignedUrl(target.path, target.token, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        const { error: previewError } = await client.storage.from('media').uploadToSignedUrl(previewTarget.path, previewTarget.token, preview, { contentType: 'image/jpeg' });
        if (previewError) throw previewError;
        setMedia((m) => [...m, { url: target.publicUrl, previewUrl: previewTarget.publicUrl, alt: '', ratio, name: file.name }]);
      } catch (e) {
        console.error(`Upload of ${file.name} failed`, e);
        setUploadError(`「${file.name}」上傳失敗。支援 JPEG、PNG、WebP，轉檔後要小於 8 MB。`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const payload = JSON.stringify({
    body: main,
    perAccount: Object.fromEntries(chosen.filter((a) => custom[a.id] !== undefined).map((a) => [a.id, custom[a.id]])),
    accountIds: chosen.map((a) => a.id),
    media: media.map(({ url, previewUrl, alt }) => ({ url, previewUrl, ...(alt ? { alt } : {}) })),
    schedule: mode === 'now' ? { mode } : { mode, date, time },
    viewerTimeZone: viewerTz,
  });

  /** When an account's post goes out, on its own clock, e.g. "10/20 20:00". */
  const whenFor = (a: Account) => {
    if (mode === 'now') return '剛剛';
    try {
      const at = zonedTimeToUtc(date, time, mode === 'local' ? a.timeZone : viewerTz);
      return `${dayInZone(at, a.timeZone)} ${clockInZone(at, a.timeZone)}`;
    } catch {
      return '';
    }
  };
  const pvAcc = chosen.find((a) => a.id === previewId) ?? chosen[0];
  const pvText = pvAcc ? textFor(pvAcc.id) : '';
  const md = date.slice(5).replace('-', '/');
  const scheduleText = mode === 'now' ? '送出後一分鐘內發布'
    : mode === 'local' ? `${md} ${time}，各帳號自己的時間${zones.length ? `（${zones.map(zoneName).join('、')}）` : ''}`
    : `${zoneName(viewerTz)} ${md} ${time}${zones.filter((z) => z !== viewerTz).length ? ` ＝ ${chosen.filter((a, i) => a.timeZone !== viewerTz && chosen.findIndex((b) => b.timeZone === a.timeZone) === i).map((a) => `${zoneName(a.timeZone)} ${whenFor(a)}`).join(' · ')}` : ''}`;
  const reviewed = role !== 'owner' && role !== 'admin';
  const customised = chosen.filter((a) => custom[a.id] !== undefined).length;

  return (
    <form action={action} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <input type="hidden" name="payload" value={payload} />
      <header className="row" style={{ padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', gap: 12 }}>
        <a href="/app" className="btn icon-btn" aria-label="返回總覽" style={{ border: 0 }}><Icon name="chevronLeft" size={20} stroke={2} /></a>
        <h1 style={{ fontSize: 18 }}>新增貼文</h1>
        <span className="chip chip-neutral">草稿</span>
        <span className="spacer small muted">{workspace}</span>
      </header>

      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap' }}>
        <section aria-label="編輯內容" style={{ flex: '999 1 600px', minWidth: 0, padding: '24px 28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>發到哪些帳號</span>
              <span className="small muted">已選 {chosen.length} 個帳號</span>
            </div>
            {accounts.length === 0 && <p className="small muted" style={{ margin: 0 }}>還沒有連結帳號，請先到 <a href="/app/channels">帳號與群組</a> 連結。</p>}
            {accounts.length > 0 && (
              <div className="row" style={{ gap: 6 }} aria-label="用群組快速選取">
                {usedGroups.length > 0 && <span className="tiny muted" style={{ marginRight: 2 }}>群組</span>}
                {usedGroups.map((g) => {
                  const st = groupState(g);
                  return <button key={g.id} type="button" className="pill" aria-pressed={st === 'all'} aria-selected={st === 'all'} onClick={() => toggleGroup(g)}>{g.name}{st === 'some' ? '（部分）' : ''}</button>;
                })}
                <button type="button" className="pill" aria-selected={chosen.length === accounts.length} onClick={() => setOn(Object.fromEntries(accounts.map((a) => [a.id, chosen.length !== accounts.length])))}>全部</button>
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              {accounts.map((a) => {
                const bad = a.status !== 'active';
                const sel = !!on[a.id];
                return (
                  <button key={a.id} type="button" aria-pressed={sel} title={a.name} onClick={() => setOn((o) => ({ ...o, [a.id]: !o[a.id] }))}
                    className="row" style={{ gap: 6, minHeight: 40, padding: '0 10px 0 6px', borderRadius: 20, flexWrap: 'nowrap', border: `1px solid ${sel ? (bad ? '#E9A39C' : 'var(--accent)') : 'var(--line)'}`, background: sel ? (bad ? '#FFFAF9' : '#F7F9FF') : '#fff', opacity: sel ? 1 : 0.55 }}>
                    <Pf pf={a.platform} bad={bad} />
                    <span className="small">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ padding: '14px 16px 0' }}>
              <span style={{ fontWeight: 600 }}>主要文字</span>
              <span className="tiny muted">{customizing ? `沒有個別調整的帳號用這段（${chosen.length - customised} 個）` : `會發到選取的 ${chosen.length} 個帳號`}</span>
            </div>
            <label htmlFor="caption" className="sr-only">主要文字</label>
            <textarea id="caption" rows={7} value={main} onChange={(e) => setMain(e.target.value)} placeholder="寫下要發的內容"
              style={{ margin: '10px 16px 0', padding: 0, border: 0, resize: 'vertical', fontSize: 15, lineHeight: 1.65, outline: 'none', background: 'transparent' }} />

            <div className="row" style={{ padding: '12px 16px', gap: 10, alignItems: 'flex-end' }}>
              {media.map((m, i) => (
                <div key={m.url} className="stack" style={{ width: 80, gap: 4 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on our own storage domain */}
                  <img src={m.previewUrl} alt={m.alt || m.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                  <button type="button" className="tiny" onClick={() => setMedia((all) => all.filter((x) => x !== m))} style={{ border: 0, background: 'none', color: 'var(--accent)', padding: 0 }} aria-label={`移除第 ${i + 1} 張圖`}>移除</button>
                </div>
              ))}
              <label style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed #B8BEC7', background: '#FAFBFC', fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                {uploading ? `上傳中…` : '加入媒體'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
              </label>
              {media.length > 0 && (
                <div className="stack" style={{ gap: 4, flex: '1 1 200px' }}>
                  {media.map((m, i) => (
                    <input key={m.url} aria-label={`第 ${i + 1} 張圖的替代文字`} className="input" placeholder={`第 ${i + 1} 張圖的替代文字（選填，IG 會用到）`} value={m.alt} onChange={(e) => setMedia((all) => all.map((x) => (x === m ? { ...x, alt: e.target.value } : x)))} style={{ minHeight: 30, fontSize: 12 }} />
                  ))}
                </div>
              )}
            </div>
            {uploadError && <p className="small" style={{ color: 'var(--err)', margin: '0 16px 12px' }}>{uploadError}</p>}
            <div className="row" style={{ padding: '10px 16px', borderTop: '1px solid var(--line-soft)', gap: 6 }}>
              <span className="tiny muted">圖片會發到所有選取的帳號</span>
              <span className="spacer small muted num">{main.length} 字</span>
            </div>
          </div>

          {!customizing ? (
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={chosen.length === 0} onClick={() => setCustomizing(true)}>
              個別調整每個帳號<Icon name="chevronRight" size={16} />
            </button>
          ) : (
            <section className="stack" aria-labelledby="h-each">
              <div className="row">
                <h2 id="h-each" style={{ fontSize: 16 }}>個別調整</h2>
                <span className="tiny muted">先帶入主要文字；改過的帳號不會再跟著主要文字變動。</span>
              </div>
              {chosen.length === 0 && <div className="small muted">先選要發的帳號。</div>}
              <div className="grid" style={{ '--min': '300px' } as CSSProperties}>
                {chosen.map((a) => {
                  const own = custom[a.id] !== undefined;
                  const text = custom[a.id] ?? main;
                  const limit = a.platform === 'instagram' ? IG_MAX : a.platform === 'line' ? LINE_MAX : null;
                  return (
                    <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', borderColor: own ? 'var(--accent-line)' : 'var(--line)' }}>
                      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', gap: 8, flexWrap: 'nowrap' }}>
                        <Pf pf={a.platform} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 500 }}>{a.name}</span>
                          <span className="tiny muted">{PLATFORM[a.platform].name} · {zoneName(a.timeZone)}</span>
                        </span>
                        <span className="tiny" style={{ fontWeight: 600, color: own ? 'var(--accent)' : 'var(--ink-3)' }}>{own ? '已調整' : '主要文字'}</span>
                      </div>
                      <label htmlFor={`t-${a.id}`} className="sr-only">{a.name} 的內容</label>
                      <textarea id={`t-${a.id}`} rows={6} value={text} onChange={(e) => setCustom((c) => ({ ...c, [a.id]: e.target.value }))} onFocus={() => setPreviewId(a.id)}
                        style={{ margin: '10px 14px 0', padding: 0, border: 0, resize: 'vertical', fontSize: 14, lineHeight: 1.6, outline: 'none', background: 'transparent', color: own ? 'var(--ink)' : 'var(--ink-2)' }} />
                      {a.platform === 'line' && (
                        <div className="row tiny" style={{ padding: '8px 14px 0', gap: 6 }}>
                          <span style={{ color: 'var(--ink-2)' }}>發送對象</span>
                          <span className="chip chip-plan" style={{ height: 26 }}>全部好友</span>
                          <span className="chip chip-neutral" style={{ height: 26 }}>{media.length ? `文字＋圖片（${1 + Math.min(media.length, LINE_IMAGES)} 則訊息）` : '文字'}</span>
                        </div>
                      )}
                      <div className="row" style={{ padding: '10px 14px', gap: 6, marginTop: 'auto' }}>
                        {own && <button type="button" className="btn btn-sm" onClick={() => setCustom((c) => { const n = { ...c }; delete n[a.id]; return n; })}>改回主要文字</button>}
                        <span className="spacer tiny muted num">{text.length}{limit ? ` / ${limit.toLocaleString('en-US')}` : ''} 字</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="card card-pad stack">
            <div className="row">
              <h3>發布前檢查</h3>
              <span className="tiny muted">依各平台規則檢查每個選取的帳號</span>
            </div>
            {checks.length === 0 && <div className="small muted">選帳號後會在這裡檢查。</div>}
            {checks.map((c) => (
              <div key={c.title} className="check">
                <span className="check-mark" aria-hidden="true" style={{ background: CHECK[c.tone].bg, color: CHECK[c.tone].fg }}>{CHECK[c.tone].mark}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{c.title}</div>
                  <div className="small" style={{ color: 'var(--ink-2)' }}>{c.detail}</div>
                </div>
                {c.href && <a className="btn btn-sm" href={c.href}>{c.action}</a>}
              </div>
            ))}
          </div>
        </section>

        <aside style={{ flex: '1 1 400px', minWidth: 0, padding: '20px 24px 32px', background: '#ECEEF1', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="seg" role="tablist" aria-label="右側面板"><button type="button" role="tab" aria-selected="true">預覽</button></div>
          {!pvAcc ? (
            <div className="small muted">選帳號後，這裡會顯示貼文在各帳號的樣子。</div>
          ) : (
            <div className="stack">
              <label className="row small" style={{ gap: 8 }}>
                <span style={{ color: 'var(--ink-2)' }}>預覽帳號</span>
                <select className="select" value={pvAcc.id} onChange={(e) => setPreviewId(e.target.value)} style={{ minHeight: 34, fontSize: 13, flex: 1 }}>
                  {chosen.map((a) => <option key={a.id} value={a.id}>{PLATFORM[a.platform].name} · {a.name}{custom[a.id] !== undefined ? '（已調整）' : ''}</option>)}
                </select>
              </label>
              {pvAcc.platform === 'line' ? (
                <div style={{ background: '#8CABD9', borderRadius: 10, padding: '16px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="brand-mark" style={{ borderRadius: 16, width: 32, height: 32, flex: 'none' }} aria-hidden="true">{pvAcc.name.slice(0, 1)}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '82%' }}>
                    {pvText && <div className="small" style={{ background: '#fff', borderRadius: 14, padding: '10px 12px', whiteSpace: 'pre-line' }}>{pvText}</div>}
                    {media.slice(0, LINE_IMAGES).map((m) => (
                      // eslint-disable-next-line @next/next/no-img-element -- user uploads on our own storage domain
                      <img key={m.url} src={m.previewUrl} alt="" style={{ width: 180, borderRadius: 14 }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ border: 0, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,24,30,.08)' }}>
                  <div className="row" style={{ padding: '12px 14px', gap: 10 }}>
                    <span className="brand-mark" style={{ borderRadius: 17, width: 34, height: 34 }} aria-hidden="true">{pvAcc.name.replace('@', '').slice(0, 1).toUpperCase()}</span>
                    <div><div style={{ fontWeight: 600 }}>{pvAcc.name}</div><div className="tiny muted">{whenFor(pvAcc)}{mode === 'now' ? '' : `（${zoneName(pvAcc.timeZone)}）`}</div></div>
                  </div>
                  {pvAcc.platform === 'facebook' && pvText && <div style={{ padding: '0 14px 12px', whiteSpace: 'pre-line' }}>{pvText}</div>}
                  {media.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: media.length > 1 && pvAcc.platform === 'facebook' ? '1fr 1fr' : '1fr', gap: 2 }}>
                      {(pvAcc.platform === 'instagram' ? media.slice(0, 1) : media.slice(0, 4)).map((m) => (
                        // eslint-disable-next-line @next/next/no-img-element -- user uploads on our own storage domain
                        <img key={m.url} src={m.previewUrl} alt="" style={{ width: '100%', aspectRatio: pvAcc.platform === 'instagram' ? String(Math.min(Math.max(m.ratio, IG_RATIO[0]), IG_RATIO[1])) : '1', objectFit: 'cover', display: 'block' }} />
                      ))}
                    </div>
                  )}
                  {pvAcc.platform === 'instagram' && <div style={{ padding: '10px 14px 14px', whiteSpace: 'pre-line', fontSize: 13 }}><strong>{pvAcc.name.replace('@', '')}</strong> {pvText}</div>}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="row compose-footer" style={{ padding: '12px 24px', background: 'var(--surface)', borderTop: '1px solid var(--line)', gap: '10px 14px', position: 'sticky', bottom: 0 }}>
        <div className="seg" role="radiogroup" aria-label="發布時間的基準">
          {([['now', '馬上發'], ['local', '依各帳號時區'], ['same', '同一時刻']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        {mode !== 'now' && (
          <>
            <label className="sr-only" htmlFor="date">日期</label>
            <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: 36 }} />
            <label className="sr-only" htmlFor="time">時間</label>
            <input id="time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} style={{ minHeight: 36 }} />
          </>
        )}
        <span className="small num">{scheduleText}</span>
        <div className="row spacer">
          {(state.error || blocking > 0) && <span className="tiny" style={{ color: 'var(--err)' }}>{state.error ?? `還有 ${blocking} 項要處理才能送出`}</span>}
          {!state.error && !blocking && <span className="tiny muted">{reviewed ? '送出後由擁有者或管理員核准' : '你送出的貼文會直接排程'}</span>}
          <button type="submit" className="btn btn-primary" disabled={pending || uploading > 0 || blocking > 0 || chosen.length === 0}>
            {pending ? '送出中…' : reviewed ? `送出審核（${chosen.length} 個帳號）` : `排程到 ${chosen.length} 個帳號`}
          </button>
        </div>
      </footer>
    </form>
  );
}
