// Small hand-built SVG charts. One axis each, thin marks, recessive grid,
// text in text tokens, hover tooltips on every plot.
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
      className="pointer-events-none absolute z-[var(--z-dock)] -translate-x-1/2 -translate-y-full rounded-[6px] border border-line bg-raised px-2.5 py-1.5 shadow-sheet"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

// ---------- sparkline (KPI cards) ----------
export function Sparkline({ values, color = 'var(--data)', height = 36, label }: { values: (number | null)[]; color?: string; height?: number; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v !== null) as { i: number; v: number }[];
  const max = Math.max(1, ...pts.map((p) => p.v));
  const min = Math.min(0, ...pts.map((p) => p.v));
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * (w - 6) + 3 : w / 2);
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 10);
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts.at(-1);
  return (
    <div ref={ref} className="h-9 w-full" role="img" aria-label={label}>
      {w > 0 && pts.length > 1 && (
        <svg width={w} height={height} aria-hidden>
          <path d={`${line}L${x(last!.i)},${height}L${x(pts[0].i)},${height}Z`} fill={color} opacity={0.1} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(last!.i)} cy={y(last!.v)} r={4} fill={color} stroke="var(--surface-raised)" strokeWidth={2} />
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
          {limit !== undefined && (
            <g>
              <line x1={padL} x2={w - padR} y1={y(limit)} y2={y(limit)} stroke="var(--critical)" strokeWidth={1} />
              <text x={w - padR} y={y(limit) - 6} textAnchor="end" className="fill-[var(--critical)] text-[11px] font-semibold">
                {limitLabel}
              </text>
            </g>
          )}
          <path d={area} fill="var(--data)" opacity={0.1} />
          <path d={path} fill="none" stroke="var(--data)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-[var(--ink-muted)] text-[11px]">
              {dayLabel(points[i].day)}
            </text>
          ))}
          {lastIdx >= 0 && points[lastIdx].mins !== null && (
            <circle cx={x(lastIdx)} cy={y(points[lastIdx].mins!)} r={4} fill="var(--data)" stroke="var(--surface-raised)" strokeWidth={2} />
          )}
          {h && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={padT} y2={padT + ih} stroke="var(--line-strong)" strokeWidth={1} />
              {h.mins !== null && <circle cx={x(hover!)} cy={y(h.mins)} r={4} fill="var(--data)" stroke="var(--surface-raised)" strokeWidth={2} />}
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
                  const isTop = k === segs.length - 1;
                  const hgt = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0));
                  return isTop ? (
                    <path
                      key={s}
                      d={`M${cx0},${y0 - (k > 0 ? 2 : 0)}V${y1 + 4}a4,4 0 0 1 4,-4H${cx0 + bw - 4}a4,4 0 0 1 4,4V${y0 - (k > 0 ? 2 : 0)}Z`}
                      fill={SEV_FILL[s]}
                    />
                  ) : (
                    <rect key={s} x={cx0} y={y1} width={bw} height={hgt} fill={SEV_FILL[s]} />
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
          <div className="mt-1 h-2 rounded-full bg-sunken">
            <div className="h-full rounded-full bg-data transition-[width] duration-500 group-hover:opacity-80" style={{ width: `${(it.value / max) * 100}%` }} />
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
              className={cx('h-full transition-opacity', hover && hover !== p.key && 'opacity-40')}
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
          <div className="h-6 rounded-r-[4px] bg-transparent">
            <div className="h-full rounded-r-[4px]" style={{ width: `${((r.mins ?? 0) / max) * 100}%`, background: (r.mins ?? 0) > limit ? 'var(--chart-critical)' : 'var(--data)' }} />
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
