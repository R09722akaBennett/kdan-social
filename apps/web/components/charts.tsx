'use client';

import { useEffect, useRef, useState } from 'react';

export type Series = { key: string; label: string; color: string };
type Point = { day: string } & Record<string, number | string | null>;


/** Round the axis top up to 1, 2 or 5 times a power of ten. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}
const kfmt = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));
const md = (day: string) => day.slice(5).replace('-', '/');

/**
 * A daily line chart with a legend, a crosshair and a tooltip, one shared axis for
 * measures in the same unit (counts). Days with no number leave a gap, not a zero.
 *
 * `compact` drops the legend and axes for a single small series, and fits the scale to
 * the data's own range so a slow-moving count still shows its slope.
 */
export function TrendChart({ points, series, label, compact = false }: { points: Point[]; series: Series[]; label: string; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(640);
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // Draw at the container's real width, so 11px axis text stays 11px instead of scaling.
  useEffect(() => {
    if (!wrap.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e!.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  if (points.length === 0) return <div className="small muted" style={{ padding: compact ? '8px 0' : '24px 0' }}>{compact ? '累積兩天以上的快照後會畫出走勢' : '這段期間還沒有每日數字；每天凌晨更新一次。'}</div>;
  const H = compact ? 56 : 220;
  const PAD = compact ? { top: 6, right: 6, bottom: 6, left: 6 } : { top: 12, right: 12, bottom: 26, left: 44 };
  const nums = points.flatMap((p) => series.map((s) => (typeof p[s.key] === 'number' ? (p[s.key] as number) : null))).filter((v): v is number => v !== null);
  const lo = compact ? Math.min(...nums) : 0;
  const max = compact ? Math.max(...nums) + (Math.max(...nums) === lo ? 1 : 0) : niceMax(Math.max(0, ...nums));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - lo) / (max - lo)) * ih;
  const path = (key: string) => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (typeof v !== 'number') { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const ticks = [0, max / 2, max];
  const labels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="stack" style={{ gap: 8 }}>
      {!compact && (
        <div className="row tiny" style={{ gap: 14, color: 'var(--ink-2)' }} aria-hidden="true">
          {series.map((s) => <span key={s.key} className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 2, borderRadius: 1, background: s.color }} />{s.label}</span>)}
        </div>
      )}
      <div ref={wrap} style={{ position: 'relative' }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'none' }}>
          {!compact && ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{kfmt(t)}</text>
            </g>
          ))}
          {!compact && labels.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--ink-3)">{md(points[i]!.day)}</text>)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--line)" strokeWidth={1} />}
          {series.map((s) => <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
          {h && series.map((s) => (typeof h[s.key] === 'number' ? <circle key={s.key} cx={x(hover!)} cy={y(h[s.key] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null))}
        </svg>
        {h && (
          <div className="card small" role="status" style={{ position: 'absolute', top: 8, left: `${Math.min(70, Math.max(2, (x(hover!) / W) * 100 - 10))}%`, padding: '8px 10px', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(20,24,30,.12)', minWidth: 120 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{md(h.day)}</div>
            {series.map((s) => (
              <div key={s.key} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} aria-hidden="true" />
                <span style={{ color: 'var(--ink-2)' }}>{s.label}</span>
                <span className="spacer num" style={{ fontWeight: 600 }}>{typeof h[s.key] === 'number' ? (h[s.key] as number).toLocaleString('en-US') : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
