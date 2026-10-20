const AGE: Record<string, string> = { 'from0to14': '0–14', 'from15to19': '15–19', 'from20to24': '20–24', 'from25to29': '25–29', 'from30to34': '30–34', 'from35to39': '35–39', 'from40to44': '40–44', 'from45to49': '45–49', 'from50': '50+' };
const WORDS: Record<string, string> = { F: '女性', M: '男性', U: '未說明', female: '女性', male: '男性', unknown: '未知', ios: 'iOS', android: 'Android', others: '其他' };
const TENURE: Record<string, string> = { within7days: '7 天內', within30days: '30 天內', within90days: '90 天內', within180days: '180 天內', within365days: '一年內', over365days: '超過一年', unknown: '未知' };

const regions = new Intl.DisplayNames(['zh-TW'], { type: 'region' });

/** A platform's raw bucket name in words a marketer reads; two-letter codes become country names. */
export function bucketLabel(key: string) {
  const known = AGE[key] ?? WORDS[key] ?? TENURE[key];
  if (known) return known;
  if (/^[A-Z]{2}$/.test(key)) {
    try {
      return regions.of(key) ?? key;
    } catch {
      return key;
    }
  }
  return key;
}

/**
 * A ranked list of horizontal bars with the share at each tip, as Pinterest lists top
 * metros. Counts are turned into shares of the listed total; percentages are shown as given.
 */
export function BarList({ items, unit, color = 'var(--accent)', limit = 8 }: { items: Array<{ key: string; value: number }>; unit: 'count' | 'percent'; color?: string; limit?: number }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const rows = items.slice(0, limit).map((i) => ({ ...i, share: unit === 'percent' ? i.value : (i.value / total) * 100 }));
  const max = Math.max(...rows.map((r) => r.share), 1);
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map((r) => (
        <div key={r.key} className="row small" style={{ gap: 8, flexWrap: 'nowrap' }} title={unit === 'count' ? `${r.value.toLocaleString('en-US')} 人` : undefined}>
          <span style={{ width: 96, flex: 'none', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bucketLabel(r.key)}</span>
          <span style={{ flex: 1, height: 10, borderRadius: 0, background: 'transparent', display: 'block' }}>
            <span style={{ display: 'block', height: 10, width: `${(r.share / max) * 100}%`, minWidth: 2, background: color, borderRadius: '0 4px 4px 0' }} />
          </span>
          <span className="num" style={{ width: 48, textAlign: 'right' }}>{r.share.toFixed(r.share < 10 ? 1 : 0)}%</span>
        </div>
      ))}
    </div>
  );
}
