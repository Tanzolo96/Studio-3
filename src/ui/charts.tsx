// Small hand-built SVG charts. One axis each, thin marks, recessive grid,
// text in text tokens, hover tooltips on every plot.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SeverityShape, cx } from './primitives';
import type { Severity } from '../engine/types';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Tip({ x, y, children, w }: { x: number; y: number; children: ReactNode; w: number }) {
  const left = Math.min(Math.max(x, 70), Math.max(70, w - 70));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-[var(--z-dock)] -translate-x-1/2 -translate-y-full rounded-[10px] border border-line bg-raised px-2.5 py-1.5 shadow-sheet"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

// ---------- sparkline (KPI cards) ----------
export function Sparkline({ values, color = 'var(--data)', height = 36, label, limit }: { values: (number | null)[]; color?: string; height?: number; label: string; limit?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const gid = useId().replace(/:/g, '');
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v !== null) as { i: number; v: number }[];
  const max = Math.max(1, limit ?? 0, ...pts.map((p) => p.v)) * 1.1;
  const min = Math.min(0, ...pts.map((p) => p.v));
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * (w - 6) + 3 : w / 2);
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 10);
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts.at(-1);
  return (
    <div ref={ref} className="w-full" style={{ height }} role="img" aria-label={label}>
      {w > 0 && pts.length > 1 && (
        <svg width={w} height={height} aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {limit !== undefined && <rect x={0} y={0} width={w} height={Math.max(0, y(limit))} fill="var(--critical)" opacity={0.08} />}
          {limit !== undefined && <line x1={0} x2={w} y1={y(limit)} y2={y(limit)} stroke="var(--critical)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />}
          <path d={`${line}L${x(last!.i)},${height}L${x(pts[0].i)},${height}Z`} fill={`url(#${gid})`} className="anim-fade" />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pathLength={100} strokeDasharray={100} className="anim-draw" />
          <circle cx={x(last!.i)} cy={y(last!.v)} r={4} fill={color} stroke="var(--surface-raised)" strokeWidth={2} className="anim-pop" style={{ '--i': 90 } as CSSProperties} />
        </svg>
      )}
    </div>
  );
}

// ---------- area trend with a limit line ----------
export function TrendArea({
  points,
  limit,
  limitLabel,
  format,
  dayLabel,
  height = 180,
  label,
}: {
  points: { day: number; mins: number | null }[];
  limit?: number;
  limitLabel?: string;
  format: (v: number) => string;
  dayLabel: (t: number) => string;
  height?: number;
  label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');
  const padL = 36, padR = 12, padT = 12, padB = 24;
  const vals = points.map((p) => p.mins).filter((v): v is number => v !== null);
  const top = Math.ceil(Math.max(limit ?? 0, ...vals, 1) * 1.15);
  const iw = Math.max(0, w - padL - padR);
  const ih = height - padT - padB;
  const x = (i: number) => padL + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const y = (v: number) => padT + ih - (v / top) * ih;
  const ticks = [0, Math.round(top / 2), top];
  const segs: string[] = [];
  points.forEach((p, i) => {
    if (p.mins === null) return;
    segs.push(`${segs.length && points[i - 1]?.mins !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.mins).toFixed(1)}`);
  });
  const path = segs.join('');
  const firstIdx = points.findIndex((p) => p.mins !== null);
  const lastIdx = points.length - 1 - [...points].reverse().findIndex((p) => p.mins !== null);
  const area = firstIdx >= 0 ? `${path}L${x(lastIdx)},${y(0)}L${x(firstIdx)},${y(0)}Z` : '';
  const h = hover !== null ? points[hover] : undefined;
  return (
    <div ref={ref} className="relative w-full" role="img" aria-label={label}>
      {w > 0 && (
        <svg
          width={w}
          height={height}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - padL) / iw) * (points.length - 1));
            setHover(i >= 0 && i < points.length ? i : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--ink-muted)] font-mono text-[11px]">
                {t}
              </text>
            </g>
          ))}
          {limit !== undefined && <rect x={padL} y={padT} width={iw} height={Math.max(0, y(limit) - padT)} fill="var(--critical)" opacity={0.07} className="anim-fade" />}
          {limit !== undefined && (
            <g>
              <line x1={padL} x2={w - padR} y1={y(limit)} y2={y(limit)} stroke="var(--critical)" strokeWidth={1} strokeDasharray="4 4" className="anim-grow-x" style={{ transformBox: 'fill-box' } as CSSProperties} />
              <text x={w - padR} y={y(limit) - 6} textAnchor="end" className="fill-[var(--critical)] text-[11px] font-semibold">
                {limitLabel}
              </text>
            </g>
          )}
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} className="anim-grow-y" />
          <path d={path} fill="none" stroke="var(--brand)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" pathLength={100} strokeDasharray={100} className="anim-draw" />
          {limit !== undefined &&
            points.map((p, i) =>
              p.mins !== null && p.mins > limit ? (
                <circle key={i} cx={x(i)} cy={y(p.mins)} r={4} fill="var(--critical)" stroke="var(--surface-raised)" strokeWidth={2} className="anim-pop" style={{ '--i': 60 + i } as CSSProperties}>
                  <title>{`${dayLabel(p.day)}: ${format(p.mins)}, over the limit`}</title>
                </circle>
              ) : null,
            )}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-[var(--ink-muted)] text-[11px]">
              {dayLabel(points[i].day)}
            </text>
          ))}
          {lastIdx >= 0 && points[lastIdx].mins !== null && (
            <g>
              <circle cx={x(lastIdx)} cy={y(points[lastIdx].mins!)} r={4} fill="var(--brand)" className="pulse-dot" />
              <circle cx={x(lastIdx)} cy={y(points[lastIdx].mins!)} r={4.5} fill="var(--brand)" stroke="var(--surface-raised)" strokeWidth={2} className="anim-pop" style={{ '--i': 100 } as CSSProperties} />
            </g>
          )}
          {h && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={padT} y2={padT + ih} stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 3" />
              {h.mins !== null && <circle cx={x(hover!)} cy={y(h.mins)} r={5} fill={limit !== undefined && h.mins > limit ? 'var(--critical)' : 'var(--brand)'} stroke="var(--surface-raised)" strokeWidth={2} />}
            </g>
          )}
        </svg>
      )}
      {h && (
        <Tip x={x(hover!)} y={h.mins !== null ? y(h.mins) : padT + ih / 2} w={w}>
          <p className="t-small text-muted">{dayLabel(h.day)}</p>
          <p className="t-data">{h.mins !== null ? format(h.mins) : 'No alerts that week'}</p>
        </Tip>
      )}
    </div>
  );
}

// ---------- stacked columns by severity ----------
const SEV_FILL: Record<Severity, string> = { critical: 'var(--chart-critical)', major: 'var(--chart-major)', minor: 'var(--chart-minor)' };
const SEV_WORD: Record<Severity, string> = { critical: 'Critical', major: 'Major', minor: 'Minor' };

export function SeverityLegend() {
  return (
    <ul className="t-small flex gap-4 text-muted">
      {(['critical', 'major', 'minor'] as Severity[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <SeverityShape level={s} size={10} />
          {SEV_WORD[s]}
        </li>
      ))}
    </ul>
  );
}

const LED: Record<Severity, string> = { critical: 'var(--led-critical)', major: 'var(--led-major)', minor: 'var(--led-minor)' };

function LedShape({ s, x, y, r, fill }: { s: Severity; x: number; y: number; r: number; fill: string }) {
  if (s === 'critical') return <path d={`M${x} ${y - r * 1.15}L${x + r} ${y + r * 0.75}L${x - r} ${y + r * 0.75}Z`} fill={fill} />;
  if (s === 'major') return <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} fill={fill} />;
  return <circle cx={x} cy={y} r={r * 0.85} fill={fill} />;
}

/** Alerts per day as a shop-floor LED board: one lane per severity, one column per day. */
export function LedBoard({
  data,
  dayLabel,
  label,
}: {
  data: { day: number; critical: number; major: number; minor: number }[];
  dayLabel: (t: number) => string;
  label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const sevs: Severity[] = ['critical', 'major', 'minor'];
  const totals = { critical: 0, major: 0, minor: 0 } as Record<Severity, number>;
  data.forEach((d) => sevs.forEach((s) => (totals[s] += d[s])));
  const total = totals.critical + totals.major + totals.minor;
  const quiet = data.filter((d) => d.critical + d.major + d.minor === 0).length;
  const sum = (d: (typeof data)[number]) => d.critical + d.major + d.minor;
  let busiest = 0;
  data.forEach((d, i) => { if (sum(d) > sum(data[busiest])) busiest = i; });
  const compact = w < 520;
  const padL = compact ? 64 : 86, padR = 14;
  const gaps = Math.floor((data.length - 1) / 7);
  const gapW = 4;
  const dx = Math.max(6, (w - padL - padR - gaps * gapW) / Math.max(1, data.length - 1 + 0.0001));
  const X = (i: number) => padL + i * dx + Math.floor(i / 7) * gapW;
  const r = Math.max(2.4, Math.min(5.2, dx * 0.32));
  const head = 56, laneH = 30, laneTop = head + 34;
  const totY = laneTop + laneH * 3 - 4;
  const height = totY + 44;
  const today = data.length - 1;
  return (
    <div ref={ref} className="relative w-full" role="img" aria-label={`${label}. ${total} alerts: ${totals.critical} critical, ${totals.major} major, ${totals.minor} minor; ${quiet} quiet days.`}>
      {w > 0 && (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)} className="block">
          <rect x={0} y={0} width={w} height={height} rx={10} fill="var(--led-bg)" />
          <text x={16} y={40} fill="var(--led-ink)" className="font-mono text-[30px] font-medium">{total}</text>
          <text x={16 + String(total).length * 19 + 8} y={28} fill="var(--led-dim)" className="text-[11px]">alerts</text>
          <text x={16 + String(total).length * 19 + 8} y={41} fill="var(--led-dim)" className="text-[11px]">this month</text>
          {!compact && sevs.map((s, k) => {
            const x = 150 + k * 104;
            return (
              <g key={s}>
                <LedShape s={s} x={x} y={33} r={5.5} fill={LED[s]} />
                <text x={x + 11} y={38} fill="var(--led-ink)" className="font-mono text-[15px] font-medium">{totals[s]}</text>
                <text x={x + 11 + String(totals[s]).length * 10 + 5} y={38} fill="var(--led-dim)" className="text-[11px]">{SEV_WORD[s].toLowerCase()}</text>
              </g>
            );
          })}
          <text x={w - 16} y={38} textAnchor="end" fill="var(--led-dim)" className="text-[11px]">{quiet} quiet day{quiet === 1 ? '' : 's'}{sum(data[busiest]) > 1 ? ` · busiest ${dayLabel(data[busiest].day)}` : ''}</text>
          <line x1={14} x2={w - 14} y1={head} y2={head} stroke="var(--led-rule)" />
          {/* today + busiest markers */}
          <rect x={X(today) - r - 4} y={laneTop - 16} width={2 * r + 8} height={laneH * 3 + 26} rx={4} fill="none" stroke="var(--led-ink)" strokeOpacity={0.55} />
          <text x={X(today) + r + 4} y={laneTop - 22} textAnchor="end" fill="var(--led-ink)" className="text-[11px]">Today</text>
          {sevs.map((s, k) => {
            const yy = laneTop + k * laneH;
            return (
              <g key={s}>
                <LedShape s={s} x={20} y={yy} r={4.5} fill={LED[s]} />
                <text x={31} y={yy + 4} fill="var(--led-dim)" className="text-[11px]">{SEV_WORD[s]}</text>
                {data.map((d, i) => (
                  <g key={d.day}>
                    <circle cx={X(i)} cy={yy} r={r} fill={d[s] ? LED[s] : 'var(--led-off)'} className={d[s] ? 'anim-pop' : undefined} style={{ '--i': i } as CSSProperties} opacity={hover === null || hover === i ? 1 : 0.4} />
                    {d[s] > 1 && <circle cx={X(i)} cy={yy} r={r + 3} fill="none" stroke={LED[s]} strokeWidth={1.2} />}
                  </g>
                ))}
              </g>
            );
          })}
          <line x1={14} x2={w - 14} y1={totY - 12} y2={totY - 12} stroke="var(--led-rule)" />
          <text x={31} y={totY + 6} fill="var(--led-dim)" className="text-[11px]">Total</text>
          {data.map((d, i) => (
            <text key={d.day} x={X(i)} y={totY + 6} textAnchor="middle" fill={i === busiest && sum(d) > 1 ? 'var(--led-critical)' : sum(d) ? 'var(--led-ink)' : 'var(--led-dim)'} className="font-mono text-[11px]">
              {sum(d) || '·'}
            </text>
          ))}
          {data.map((d, i) => (i % 7 === 0 ? (
            <text key={d.day} x={X(i) - r} y={height - 10} fill="var(--led-dim)" className="text-[11px]">{dayLabel(d.day)}</text>
          ) : null))}
          {data.map((d, i) => (
            <rect key={d.day} x={X(i) - dx / 2} y={laneTop - 14} width={dx} height={laneH * 3 + 30} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tip x={X(hover)} y={laneTop - 10} w={w}>
          <p className="t-small-strong">{dayLabel(data[hover].day)}</p>
          {sevs.map((s) => (
            <p key={s} className="t-small flex items-center gap-1.5">
              <SeverityShape level={s} size={9} />
              {SEV_WORD[s]} <span className="t-data ml-auto pl-3">{data[hover][s]}</span>
            </p>
          ))}
        </Tip>
      )}
    </div>
  );
}

export function StackedColumns({
  data,
  dayLabel,
  height = 180,
  label,
}: {
  data: { day: number; critical: number; major: number; minor: number }[];
  dayLabel: (t: number) => string;
  height?: number;
  label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 24, padR = 4, padT = 8, padB = 24;
  const max = Math.max(2, ...data.map((d) => d.critical + d.major + d.minor));
  const iw = Math.max(0, w - padL - padR);
  const ih = height - padT - padB;
  const band = iw / data.length;
  const bw = Math.min(14, Math.max(4, band - 4));
  const y = (v: number) => padT + ih - (v / max) * ih;
  const order: Severity[] = ['minor', 'major', 'critical'];
  return (
    <div ref={ref} className="relative w-full" role="img" aria-label={label}>
      {w > 0 && (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
          {[0, max].map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--ink-muted)] font-mono text-[11px]">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx0 = padL + i * band + (band - bw) / 2;
            let acc = 0;
            const total = d.critical + d.major + d.minor;
            const segs = order.filter((s) => d[s] > 0);
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.45}>
                <rect x={padL + i * band} y={padT} width={band} height={ih} fill="transparent" />
                {segs.map((s, k) => {
                  const y0 = y(acc);
                  acc += d[s];
                  const y1 = y(acc);
                  const hgt = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0));
                  return (
                    <rect key={s} x={cx0} y={y1} width={bw} height={hgt} fill={SEV_FILL[s]} className="anim-grow-y" style={{ '--i': i } as CSSProperties} />
                  );
                })}
                {total === 0 && <rect x={cx0} y={y(0) - 2} width={bw} height={2} rx={1} fill="var(--grid)" />}
              </g>
            );
          })}
          {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
            <text key={i} x={padL + i * band + band / 2} y={height - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="fill-[var(--ink-muted)] text-[11px]">
              {dayLabel(data[i].day)}
            </text>
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tip x={padL + hover * band + band / 2} y={y(data[hover].critical + data[hover].major + data[hover].minor)} w={w}>
          <p className="t-small-strong">{dayLabel(data[hover].day)}</p>
          {(['critical', 'major', 'minor'] as Severity[]).map((s) => (
            <p key={s} className="t-small flex items-center gap-1.5">
              <SeverityShape level={s} size={9} />
              {SEV_WORD[s]} <span className="t-data ml-auto pl-3">{data[hover][s]}</span>
            </p>
          ))}
        </Tip>
      )}
    </div>
  );
}

// ---------- horizontal bar list (top causes) ----------
export function BarList({ items, max: maxIn, format = (v) => String(v), onPick }: { items: { name: string; value: number }[]; max?: number; format?: (v: number) => string; onPick?: (name: string) => void }) {
  const max = maxIn ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.name} className="group" title={`${it.name}: ${format(it.value)}`} onClick={() => onPick?.(it.name)}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="t-small truncate">{it.name}</span>
            <span className="t-data text-[13px]">{format(it.value)}</span>
          </div>
          <div className="relative mt-1.5 h-3">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-[var(--grid)]" />
            <span className="anim-grow-x absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-[var(--data)]" style={{ width: `calc(${(it.value / max) * 100}% - 6px)` }} />
            <span className="anim-pop absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-raised)] bg-brand shadow-[0_0_0_1px_var(--brand)] transition-transform group-hover:scale-125" style={{ left: `calc(${(it.value / max) * 100}% - 6px)`, '--i': 40 } as CSSProperties} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- category bar (share of a whole) ----------
export function CategoryBar({ parts, label }: { parts: { key: string; value: number; color: string; word: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={label}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.key}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
              className={cx('anim-grow-x h-full transition-opacity', hover && hover !== p.key && 'opacity-40')}
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              title={`${p.word}: ${p.value}`}
            />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.key} className={cx('t-small flex items-center gap-1.5', p.value === 0 && 'text-muted')}>
            <span className="size-2.5 rounded-full" style={{ background: p.value ? p.color : 'var(--grid)' }} aria-hidden />
            {p.word}
            <span className="t-data text-[13px]">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- shift comparison with a target line ----------
export function ShiftBars({ rows, limit, label }: { rows: { shift: string; mins: number | null; n: number }[]; limit: number; label: string }) {
  const max = Math.max(limit * 1.3, ...rows.map((r) => r.mins ?? 0));
  return (
    <div className="relative flex flex-col gap-3" role="img" aria-label={label}>
      <div className="pointer-events-none absolute top-0 bottom-0 left-[64px] right-[56px]" aria-hidden>
        <div className="absolute top-0 bottom-0 w-px bg-critical" style={{ left: `${(limit / max) * 100}%` }} />
        <span className="t-small absolute -top-5 -translate-x-1/2 font-semibold whitespace-nowrap text-critical" style={{ left: `${(limit / max) * 100}%` }}>
          {limit} min limit
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.shift} className="grid grid-cols-[52px_1fr_44px] items-center gap-3" title={`${r.shift} shift: ${r.n} alerts`}>
          <span className="t-small-strong">{r.shift} shift</span>
          <div className="relative h-6">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-[var(--grid)]" />
            <span className="anim-grow-x absolute left-0 top-1/2 h-[2px] -translate-y-1/2" style={{ width: `${((r.mins ?? 0) / max) * 100}%`, background: (r.mins ?? 0) > limit ? 'var(--chart-critical)' : 'var(--data)' }} />
            <span className="anim-pop absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-raised)]" style={{ left: `${((r.mins ?? 0) / max) * 100}%`, background: (r.mins ?? 0) > limit ? 'var(--chart-critical)' : 'var(--data)', '--i': 40 } as CSSProperties} />
          </div>
          <span className="t-data text-right">{r.mins === null ? '–' : `${r.mins.toFixed(1)}m`}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- ring gauge (percent of target) ----------
export function Ring({ value, max, color = 'var(--data)', size = 64, children, label }: { value: number; max: number; color?: string; size?: number; children?: ReactNode; label: string }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / (max || 1));
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} className="anim-gauge transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts a number up from its last value, so a live clock tick moves it smoothly instead of restarting from zero. */
export function CountUp({ value, format = (v) => String(Math.round(v)), ms = 900 }: { value: number; format?: (v: number) => string; ms?: number }) {
  const last = useRef(0);
  const [v, setV] = useState(() => (reducedMotion() ? value : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setV(value);
      last.current = value;
      return;
    }
    const from = last.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else last.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last.current = value;
    };
  }, [value, ms]);
  return <>{format(v)}</>;
}


/** Segmented meter: square cells that light up one by one, like a machine LED meter. */
export function SegmentMeter({ pct, target, segments = 20, color = 'var(--brand)', height = 12, className, label }: { pct: number; target?: number; segments?: number; color?: string; height?: number; className?: string; label?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const on = Math.round((p / 100) * segments);
  return (
    <div className={cx('relative', className)} role={label ? 'img' : undefined} aria-label={label}>
      <div className="flex gap-[2px]" style={{ height }}>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={cx('flex-1 rounded-[2px]', i < on && 'anim-pop')} style={{ background: i < on ? color : 'var(--cell-off)', '--i': i } as CSSProperties} />
        ))}
      </div>
      {target !== undefined && <span className="absolute -top-1.5 -bottom-1.5 w-[2px] bg-ink" style={{ left: `calc(${target}% - 1px)` }} title={`Target ${target}%`} />}
    </div>
  );
}

/** Instrument dial: a half dial with ticks and a needle that swings to the value. */
export function Dial({ pct, color, i = 0, label }: { pct: number; color: string; i?: number; label: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const cx0 = 52, cy0 = 52, r = 42;
  const len = Math.PI * r;
  const ticks = Array.from({ length: 11 }, (_, k) => {
    const a = Math.PI * (1 - k / 10);
    const outer = r - 9, inner = k % 5 === 0 ? r - 17 : r - 13;
    return { x1: cx0 + Math.cos(a) * outer, y1: cy0 - Math.sin(a) * outer, x2: cx0 + Math.cos(a) * inner, y2: cy0 - Math.sin(a) * inner, major: k % 5 === 0 };
  });
  const angle = -90 + (p / 100) * 180;
  return (
    <div className="relative shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 104 60" width={104} height={60}>
        <path d={`M${cx0 - r} ${cy0} A${r} ${r} 0 0 1 ${cx0 + r} ${cy0}`} fill="none" stroke="var(--cell-off)" strokeWidth={5} />
        <path d={`M${cx0 - r} ${cy0} A${r} ${r} 0 0 1 ${cx0 + r} ${cy0}`} fill="none" stroke={color} strokeWidth={5} strokeDasharray={`${(len * p) / 100} ${len}`} className="anim-gauge" style={{ '--i': i } as CSSProperties} />
        {ticks.map((t, k) => (
          <line key={k} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="var(--line-strong)" strokeWidth={t.major ? 1.6 : 1} />
        ))}
        <g className="anim-needle" style={{ '--a': `${angle}deg`, '--i': i, transformOrigin: `${cx0}px ${cy0}px` } as CSSProperties}>
          <line x1={cx0} y1={cy0} x2={cx0} y2={cy0 - r + 12} stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round" />
        </g>
        <circle cx={cx0} cy={cy0} r={4.5} fill="var(--ink)" />
        <circle cx={cx0} cy={cy0} r={1.8} fill="var(--surface-raised)" />
      </svg>
    </div>
  );
}
