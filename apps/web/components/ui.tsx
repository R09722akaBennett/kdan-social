import type { ReactNode } from 'react';

// Same glyphs as the prototype's components/ui.jsx, so the app and the demo look identical.
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  calendar: 'M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 10h18M8 3v4M16 3v4',
  check: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  spark: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  chart: 'M4 20V11M10 20V5M16 20v-6M21 20H3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  voice: 'M4 6h16M4 12h10M4 18h7M17 14l3 3-3 3',
  plus: 'M12 5v14M5 12h14',
  chevronDown: 'm7 10 5 5 5-5',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  send: 'M12 19V5M5 12l7-7 7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7.5M19 14a6 6 0 0 1 3 5v2',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export const PLATFORM = {
  facebook: { label: 'f', name: 'Facebook' },
  instagram: { label: 'IG', name: 'Instagram' },
  line: { label: 'L', name: 'LINE' },
} as const;
export type Platform = keyof typeof PLATFORM;

export function Pf({ pf, size, bad }: { pf: Platform; size?: 'sm' | 'lg'; bad?: boolean }) {
  const cls = ['pf', `pf-${pf}`, size, bad ? 'bad' : ''].filter(Boolean).join(' ');
  return <span className={cls} role="img" aria-label={PLATFORM[pf].name + (bad ? '（有問題）' : '')}>{PLATFORM[pf].label}</span>;
}

/** A group's name as a small tag; ungrouped accounts show nothing. */
export function GroupTag({ name, dark }: { name: string | null | undefined; dark?: boolean }) {
  if (!name) return null;
  return <span className={dark ? 'mk dark' : 'mk'} style={{ padding: '0 6px' }}>{name}</span>;
}

export function Chip({ tone = 'neutral', children }: { tone?: 'ok' | 'plan' | 'warn' | 'err' | 'neutral'; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

/** The prototype's segmented control, as links so a server page can filter by query string. */
export function SegLinks({ label, items }: { label: string; items: Array<{ href: string; text: string; on: boolean }> }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((i) => <a key={i.href} href={i.href} aria-pressed={i.on}>{i.text}</a>)}
    </div>
  );
}

export function AiHeader({ title, note, children }: { title: string; note?: string; children?: ReactNode }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="spark" /></span>
      <h2>{title}</h2>
      {note && <span className="tiny muted">{note}</span>}
      {children}
    </div>
  );
}

export const fmtN = (n: number) => n.toLocaleString('en-US');

// Zones offered for an account, as Buffer's channel settings offer a list. An account
// already on another zone keeps it; the select adds its current value.
const ZONES: Array<[string, string]> = [
  ['Asia/Taipei', '台北'], ['Asia/Tokyo', '東京'], ['Asia/Seoul', '首爾'], ['Asia/Hong_Kong', '香港'], ['Asia/Shanghai', '上海'],
  ['Asia/Singapore', '新加坡'], ['Asia/Kuala_Lumpur', '吉隆坡'], ['Asia/Bangkok', '曼谷'], ['Asia/Ho_Chi_Minh', '胡志明市'], ['Asia/Jakarta', '雅加達'],
  ['Asia/Manila', '馬尼拉'], ['Asia/Kolkata', 'India'], ['Asia/Dubai', 'Dubai'], ['Australia/Sydney', 'Sydney'], ['Pacific/Auckland', 'Auckland'],
  ['Europe/London', 'London'], ['Europe/Paris', 'Paris'], ['Europe/Berlin', 'Berlin'],
  ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['America/Denver', 'Denver'], ['America/Los_Angeles', 'Los Angeles'], ['America/Sao_Paulo', 'São Paulo'],
];

/** "GMT+8" for a zone at a moment; offsets move with daylight saving, so never cache them. */
function gmtOffset(timeZone: string, at: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** A zone's short name, e.g. "台北"; unknown zones show their IANA city. */
export const zoneName = (timeZone: string) => ZONES.find(([z]) => z === timeZone)?.[1] ?? timeZone.split('/').pop()!.replace(/_/g, ' ');

/** Options for a time zone select, e.g. "台北（GMT+8）", including `current` if it is not listed. */
export function zoneOptions(current?: string, at = new Date()) {
  const ids = ZONES.map(([z]) => z);
  if (current && !ids.includes(current)) ids.push(current);
  return ids.map((id) => ({ id, label: `${zoneName(id)}（${gmtOffset(id, at)}）` }));
}

/** The current wall-clock time in a zone, e.g. "18:02". */
export function localTime(timeZone: string, at = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
}

// Dispatcher errors are stored in English for logs; customers read them in Chinese.
const ERRORS: Array<[RegExp, string]> = [
  [/monthly limit/i, 'LINE 本月訊息額度已用完，下個月 1 日重置後才能再發。'],
  [/authorization has expired|reconnect the account|Session has expired|validating access token/i, '帳號授權已失效，重新連結後可以再排一次。'],
  [/Not approved before/i, '排定時間到了還沒有人核准，已略過，沒有發出。'],
  [/interrupted/i, '發送過程中斷，不確定是否已發出。請先到粉專確認，再決定要不要重發。'],
  [/gave up after/i, '平台暫時無法使用，重試 3 次後仍失敗。'],
  [/at least one image/i, 'Instagram 一定要附至少一張圖片。'],
  [/could not process the media/i, 'Instagram 無法處理這張圖片，請換一張（寬高比 4:5 到 1.91:1 的 JPEG）。'],
];

/** A stored task error, in words a customer can act on; unknown errors keep the original text. */
export function errorText(raw: string | null): string | null {
  if (!raw) return null;
  return ERRORS.find(([re]) => re.test(raw))?.[1] ?? `發送失敗：${raw}`;
}

/**
 * A section with nothing in it yet: what will appear here and the one action that
 * fills it, after Klaviyo's and Whop's empty dashboards.
 */
export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {children && <div className="small" style={{ color: 'var(--ink-2)', maxWidth: 420 }}>{children}</div>}
      {action && <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>{action}</div>}
    </div>
  );
}
