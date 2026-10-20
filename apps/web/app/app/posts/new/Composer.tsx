'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useActionState, useMemo, useState } from 'react';
import { createImageUpload, submitPost, type SubmitState } from '../actions';

type Market = { id: string; code: string; name: string; timeZone: string };
type Account = { id: string; marketId: string; platform: 'facebook' | 'instagram' | 'line'; name: string; status: string };
type Media = { url: string; previewUrl: string; alt: string; ratio: number; name: string };
type LineUsage = { accountId: string; quota: { limit: number | null; used: number } | null; audience: { followers: number; targetedReaches: number } | null; error: string | null };

const PF: Record<string, string> = { facebook: 'f', instagram: 'IG', line: 'L' };
const IG_MAX = 2200;
// Instagram rejects feed images narrower than 4:5 or wider than 1.91:1.
const IG_RATIO = [0.8, 1.91] as const;
const MAX_WIDTH = 1440;
// LINE preview images must stay under 1 MB; 640px at this quality is well below it.
const PREVIEW_WIDTH = 640;
const LINE_MAX = 5000;
const LINE_IMAGES = 4;

/** Re-encode any browser-readable image as a JPEG no wider than 1440px; Instagram accepts only JPEG. */
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

function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function Composer({ markets, accounts, supabase, lineUsage }: { markets: Market[]; accounts: Account[]; supabase: { url: string; key: string }; lineUsage: LineUsage[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [over, setOver] = useState<{ facebook?: string; instagram?: string; line?: string }>({});
  const [media, setMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const viewerTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [mode, setMode] = useState<'now' | 'local' | 'same'>('local');
  const [date, setDate] = useState(() => todayIn(viewerTz));
  const [time, setTime] = useState('20:00');
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitPost, {});

  const chosen = accounts.filter((a) => selected.includes(a.id));
  const platforms = new Set(chosen.map((a) => a.platform));
  const hasIg = platforms.has('instagram');
  const igText = (over.instagram ?? body).trim();
  const badRatio = hasIg ? media.filter((m) => m.ratio < IG_RATIO[0] || m.ratio > IG_RATIO[1]) : [];
  const hasLine = platforms.has('line');
  const lineText = (over.line ?? body).trim();
  const lineCosts = chosen.filter((a) => a.platform === 'line').map((a) => {
    const u = lineUsage.find((x) => x.accountId === a.id);
    const cost = u?.audience?.targetedReaches ?? null;
    const left = u?.quota?.limit != null ? u.quota.limit - u.quota.used : null;
    return { account: a, cost, left, error: u?.error ?? null, short: cost != null && left != null && cost > left };
  });
  const problems = [
    chosen.length === 0 && '請至少選一個帳號。',
    hasIg && media.length === 0 && 'Instagram 一定要附至少一張圖片。',
    hasIg && igText.length > IG_MAX && `Instagram 內文最多 ${IG_MAX} 字，目前 ${igText.length} 字。`,
    badRatio.length > 0 && `Instagram 只接受寬高比 4:5 到 1.91:1 的圖片，「${badRatio.map((m) => m.name).join('、')}」超出範圍。`,
    platforms.has('facebook') && !(over.facebook ?? body).trim() && media.length === 0 && 'Facebook 貼文要有文字或圖片。',
    hasLine && !lineText && media.length === 0 && 'LINE 訊息要有文字或圖片。',
    hasLine && lineText.length > LINE_MAX && `LINE 訊息最多 ${LINE_MAX} 字，目前 ${lineText.length} 字。`,
    hasLine && media.length > LINE_IMAGES && `LINE 一次最多 ${LINE_IMAGES} 張圖片，目前 ${media.length} 張。`,
    ...lineCosts.filter((c) => c.short).map((c) => `「${c.account.name}」本月額度不夠：這則會扣約 ${c.cost} 則，只剩 ${c.left} 則。`),
  ].filter(Boolean) as string[];

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
    body,
    overrides: Object.fromEntries(Object.entries(over).filter(([p]) => platforms.has(p as 'facebook'))),
    accountIds: selected,
    media: media.map(({ url, previewUrl, alt }) => ({ url, previewUrl, ...(alt ? { alt } : {}) })),
    schedule: mode === 'now' ? { mode } : { mode, date, time },
    viewerTimeZone: viewerTz,
  });

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="payload" value={payload} />

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <h2>發到哪些帳號</h2>
        {accounts.length === 0 && <p className="small muted">還沒有連結帳號，請先到總覽連結 Facebook 粉專。</p>}
        {markets.map((m) => {
          const list = accounts.filter((a) => a.marketId === m.id);
          if (list.length === 0) return null;
          return (
            <div key={m.id} className="row">
              <span className="small" style={{ width: 64 }}><strong style={{ fontSize: 11, marginRight: 6 }}>{m.code}</strong>{m.name}</span>
              {list.map((a) => {
                const on = selected.includes(a.id);
                const disabled = a.status !== 'active';
                return (
                  <label key={a.id} className="row" style={{ gap: 8, minHeight: 40, padding: '0 12px 0 8px', borderRadius: 8, border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? '#F7F9FF' : '#fff', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                    <input type="checkbox" disabled={disabled} checked={on} onChange={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))} style={{ accentColor: 'var(--accent)', margin: 0 }} />
                    <span className={`pf pf-${a.platform}`} aria-hidden="true">{PF[a.platform]}</span>
                    <span className="small">{a.name}</span>
                    {a.status !== 'active' && <span className="tiny" style={{ color: 'var(--err)' }}>授權失效</span>}
                  </label>
                );
              })}
            </div>
          );
        })}
      </section>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <label htmlFor="body"><h2>內文</h2></label>
        <textarea id="body" className="textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="所有勾選的帳號共用這段內文；某個平台要不同寫法，可以在下面另外改寫。" />
        {(['facebook', 'instagram', 'line'] as const).filter((p) => platforms.has(p)).map((p) => (
          <div key={p} className="stack" style={{ gap: 6 }}>
            <label className="row small" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={over[p] !== undefined} onChange={(e) => setOver((o) => { const n = { ...o }; if (e.target.checked) n[p] = body; else delete n[p]; return n; })} style={{ accentColor: 'var(--accent)' }} />
              {{ facebook: 'Facebook', instagram: 'Instagram', line: 'LINE' }[p]} 另外改寫
            </label>
            {over[p] !== undefined && (
              <textarea aria-label={`${p} 內文`} className="textarea" rows={4} value={over[p]} onChange={(e) => setOver((o) => ({ ...o, [p]: e.target.value }))} />
            )}
          </div>
        ))}
        {hasIg && <span className="tiny muted num">Instagram 內文 {igText.length} / {IG_MAX} 字</span>}
        {hasLine && <span className="tiny muted num">LINE 訊息 {lineText.length} / {LINE_MAX} 字</span>}
      </section>

      {hasLine && (
        <section className="card card-pad stack" style={{ gap: 8, borderColor: 'var(--warn-bar)' }} aria-label="LINE 額度">
          <h2>LINE 會群發給全部好友</h2>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>每位收到的好友扣 1 則額度，不論訊息裡有幾段文字或圖片。</p>
          {lineCosts.map((c) => (
            <div key={c.account.id} className="small" style={{ color: c.short ? 'var(--err)' : 'var(--ink)' }}>
              {c.account.name}：
              {c.error ? c.error
                : c.cost == null ? '好友數要隔天才有資料，暫時無法預估扣多少則。'
                : `預估扣 ${c.cost.toLocaleString('en-US')} 則` + (c.left != null ? `，本月剩 ${c.left.toLocaleString('en-US')} 則` : '（方案沒有上限）')}
            </div>
          ))}
        </section>
      )}

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <h2>圖片</h2>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          {media.map((m, i) => (
            <div key={m.url} className="stack" style={{ width: 140, gap: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on our own storage domain */}
              <img src={m.url} alt={m.alt || m.name} style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, outline: badRatio.includes(m) ? '2px solid var(--err)' : 'none' }} />
              <input aria-label={`第 ${i + 1} 張圖的替代文字`} className="input small" placeholder="替代文字（選填）" value={m.alt} onChange={(e) => setMedia((all) => all.map((x) => (x === m ? { ...x, alt: e.target.value } : x)))} style={{ minHeight: 32 }} />
              <button type="button" className="btn btn-sm" onClick={() => setMedia((all) => all.filter((x) => x !== m))}>移除</button>
            </div>
          ))}
          <label className="btn" style={{ width: 140, height: 140, borderStyle: 'dashed', flexDirection: 'column' }}>
            {uploading ? `上傳中（${uploading}）…` : '加入圖片'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {uploadError && <p className="small" style={{ color: 'var(--err)', margin: 0 }}>{uploadError}</p>}
        <span className="tiny muted">上傳時會轉成 JPEG（寬度最多 1440px）。圖片放在公開網址，Instagram 才抓得到。</span>
      </section>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <h2>發布時間</h2>
        <div className="seg" role="radiogroup" aria-label="發布時間">
          {([['now', '馬上發'], ['local', '各市場當地時間'], ['same', '同一時刻']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        {mode !== 'now' && (
          <div className="row">
            <label className="row small">日期<input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="row small">時間<input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          </div>
        )}
        <span className="tiny muted">
          {mode === 'now' && '送出後一分鐘內發布。'}
          {mode === 'local' && `每個市場各自在當地 ${date} ${time} 發布（例如台灣和日本相差一小時）。`}
          {mode === 'same' && `所有市場在你這裡的 ${date} ${time}（${viewerTz}）同時發布。`}
        </span>
      </section>

      {(problems.length > 0 || state.error) && (
        <div className="card card-pad stack" style={{ gap: 4, borderColor: 'var(--err-line)', background: '#FDF2F1' }} role="alert">
          {state.error && <span className="small" style={{ color: 'var(--err)' }}>{state.error}</span>}
          {problems.map((p) => <span key={p} className="small" style={{ color: 'var(--err)' }}>{p}</span>)}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <a className="btn" href="/app/posts">取消</a>
        <button type="submit" className="btn btn-primary" disabled={pending || uploading > 0 || problems.length > 0}>
          {pending ? '送出中…' : `排程到 ${chosen.length} 個帳號`}
        </button>
      </div>
    </form>
  );
}
