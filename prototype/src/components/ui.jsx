import { PF, MARKETS } from '../data.js';

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
};

export function Icon({ name, size = 18, stroke = 1.8, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Pf({ pf, size, bad }) {
  const cls = ['pf', `pf-${pf}`, size, bad ? 'bad' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls} role="img" aria-label={PF[pf].name + (bad ? '（有問題）' : '')}>
      {PF[pf].label}
    </span>
  );
}

export function Mk({ market, dark }) {
  return <span className={dark ? 'mk dark' : 'mk'}>{MARKETS[market].code}</span>;
}

export function Seg({ value, options, onChange, label, role = 'group' }) {
  return (
    <div className="seg" role={role === 'radio' ? 'radiogroup' : 'group'} aria-label={label}>
      {options.map(([k, text]) => (
        <button
          key={k}
          type="button"
          {...(role === 'radio' ? { role: 'radio', 'aria-checked': value === k } : { 'aria-pressed': value === k })}
          onClick={() => onChange(k)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export const MARKET_FILTER = [['all', '全部'], ['tw', '台灣'], ['us', '美國'], ['jp', '日本']];

export function Chip({ tone = 'neutral', children }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

const CHECK_TONE = {
  ok: { mark: '✓', bg: 'var(--ok-soft)', fg: 'var(--ok)' },
  err: { mark: '!', bg: 'var(--err-soft)', fg: 'var(--err)' },
  warn: { mark: '?', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  info: { mark: 'i', bg: 'var(--line-soft)', fg: 'var(--ink-2)' },
};

export function CheckMark({ tone }) {
  const t = CHECK_TONE[tone];
  return <span className="check-mark" aria-hidden="true" style={{ background: t.bg, color: t.fg }}>{t.mark}</span>;
}

// Seeded pseudo-random walk so each account's line stays stable between renders.
function series(start, end, n, wobble, seed) {
  const out = [];
  let r = seed;
  for (let i = 0; i < n; i++) {
    r = (r * 9301 + 49297) % 233280;
    out.push(start + (end - start) * (i / (n - 1)) + (r / 233280 - 0.5) * wobble);
  }
  out[n - 1] = end;
  return out;
}

export function Sparkline({ from, to, days, seed, color, label }) {
  const n = days === 7 ? 8 : days === 30 ? 31 : 91;
  const vals = series(from, to, n, (to - from) * 0.18, seed);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const line = vals.map((v, i) => `${((i / (n - 1)) * 320).toFixed(1)},${(80 - ((v - lo) / (hi - lo)) * 72).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 320 84" preserveAspectRatio="none" role="img" aria-label={label} style={{ width: '100%', height: 64, display: 'block' }}>
      <line x1="0" y1="83" x2="320" y2="83" stroke="var(--line)" />
      <polyline points={`0,83 ${line} 320,83`} fill={color} fillOpacity="0.09" stroke="none" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AiHeader({ title, note, children }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="spark" /></span>
      <h2>{title}</h2>
      {note && <span className="tiny muted">{note}</span>}
      {children}
    </div>
  );
}
