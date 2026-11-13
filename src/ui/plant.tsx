// Plant head building blocks, shared by the dashboard and the phone.
// Instrument language: fixed scales, one target line, grey for normal, colour only when something is wrong.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { MillState, ShiftId, Ticket } from '../engine/types';
import { frameAlerts, type ResponseDot } from '../engine/plant';
import { escalation } from '../engine/selectors';
import { holdKg, roundKg, userName } from '../engine/reducer';
import { DAY, HOUR, MIN, dayMonth, hhmm, timer } from '../engine/time';
import { SHIFTS } from '../engine/vocab';
import { cx } from './primitives';

/** Draw SVG charts at their real pixel width, so labels stay the same size on a wall screen and a laptop. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(320, Math.round(el.clientWidth)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ---------- time words ----------
export function timeLeft(ms: number) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  if (d > 0) return `${d} d ${h} h`;
  const m = Math.floor((ms % HOUR) / MIN);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function waited(ms: number) {
  const h = ms / HOUR;
  if (h >= 48) return `${Math.floor(h / 24)} days`;
  if (h >= 1) return `${Math.round(h)} h`;
  return `${Math.max(1, Math.round(ms / MIN))} min`;
}

// ---------- deadline cells: one cell per 6 hours, the lit ones are what's left ----------
export function DeadlineCells({ at, now, cells = 12, label }: { at?: number; now: number; cells?: number; label?: string }) {
  if (at === undefined) return <p className="t-small text-muted">{label ?? 'No deadline'}</p>;
  const left = at - now;
  const lit = Math.max(0, Math.min(cells, Math.ceil(left / (6 * HOUR))));
  const urgent = left < DAY;
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={`${label ?? 'Deadline'} in ${timeLeft(left)}`}>
      <div className="flex gap-[3px]">
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            className="h-2 w-3 rounded-[2px] transition-colors duration-300"
            style={{ background: i < lit ? (urgent ? 'var(--critical)' : 'var(--data)') : 'var(--cell-off)' }}
          />
        ))}
      </div>
      <span className={cx('t-small whitespace-nowrap', urgent ? 'font-semibold text-critical' : 'text-muted')}>
        {label ? `${label} ` : ''}in {timeLeft(left)}
      </span>
    </div>
  );
}

// ---------- 10 kg blocks ----------
export function KgBlocks({ kg, size = 'md', outline, className }: { kg: number; size?: 'sm' | 'md'; outline?: boolean; className?: string }) {
  const n = Math.max(1, Math.round(kg / 10));
  const dim = size === 'sm' ? 'h-2.5 w-2' : 'h-3.5 w-2.5';
  return (
    <div className={cx('flex flex-wrap gap-[3px]', className)} role="img" aria-label={`${roundKg(kg)} kg, each block 10 kg`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cx('rounded-[2px]', dim)} style={outline ? { boxShadow: 'inset 0 0 0 1.5px var(--line-strong)' } : { background: 'var(--held)' }} />
      ))}
    </div>
  );
}

// ---------- hold age: 0 to 72 h with the 24 h stale line ----------
export function AgeBar({ ms }: { ms: number }) {
  const pct = Math.min(100, (ms / (72 * HOUR)) * 100);
  const stale = ms > DAY;
  return (
    <div className="relative h-1.5 rounded-full bg-[var(--cell-off)]" role="img" aria-label={`Waiting ${waited(ms)}${stale ? ', over 24 hours' : ''}`}>
      <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: stale ? 'var(--major-fill)' : 'var(--line-strong)' }} />
      <span className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-ink" style={{ left: 'calc(33.33% - 1px)' }} />
    </div>
  );
}

// ---------- cause strip: one row per frame over weeks, alerts marked by cause, roving changes as ticks ----------
export function CauseStrip({ s, frameIds, since, now, onPick, width = 640 }: { s: MillState; frameIds: string[]; since: number; now: number; onPick?: (frameId: string) => void; width?: number }) {
  const [box, W] = useWidth(width);
  const L = 58, R = 8, rowH = 40, top = 14;
  const x = (t: number) => L + ((t - since) / (now - since)) * (W - L - R);
  const rows = frameIds.map((f) => ({ f, alerts: frameAlerts(s, f, since, now) }));
  const causes = new Map<string, number>();
  rows.forEach((r) => r.alerts.forEach(({ t }) => t.cause && causes.set(t.cause, (causes.get(t.cause) ?? 0) + 1)));
  const topCause = [...causes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const weeks: number[] = [];
  for (let t = since; t <= now; t += 7 * DAY) weeks.push(t);
  const [read, setRead] = useState<string | null>(null);
  const H = top + rowH * rows.length + 18;
  return (
    <div ref={box} className="flex min-w-0 flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`Alerts per frame since ${dayMonth(since)}, marked by cause, with roving changes`}>
        {weeks.map((w) => (
          <g key={w}>
            <line x1={x(w)} x2={x(w)} y1={top - 6} y2={top + rowH * rows.length - 10} stroke="var(--grid)" />
            <text x={x(w)} y={H - 2} textAnchor="middle" className="fill-[var(--ink-muted)] font-mono text-[10px]">
              {dayMonth(w)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = top + i * rowH + 12;
          const rov = s.rovingChanges.filter((c) => c.frameId === r.f && c.at >= since && c.at <= now);
          return (
            <g key={r.f} className={onPick ? 'cursor-pointer' : undefined} onClick={() => onPick?.(r.f)}>
              <text x={0} y={cy + 4} className="fill-[var(--ink)] text-[13px] font-semibold">
                {r.f}
              </text>
              <line x1={L} x2={W - R} y1={cy} y2={cy} stroke="var(--line-strong)" strokeDasharray="2 3" />
              {rov.map((c) => (
                <g key={c.at} className="anim-fade">
                  <line x1={x(c.at)} x2={x(c.at)} y1={cy - 17} y2={cy - 8} stroke="var(--ink)" strokeWidth={1.5} />
                  <path d={`M${x(c.at) - 3} ${cy - 18} h6 l-3 4z`} fill="var(--ink)" />
                </g>
              ))}
              {r.alerts.map(({ t, afterRoving }) => {
                const cx0 = x(t.createdAt);
                const main = t.cause === topCause;
                const say = `${r.f} · ${dayMonth(t.createdAt)} · ${t.title}${t.cause ? ` · ${t.cause}` : ''}${afterRoving ? ' · within 2 h of a roving change' : ''}`;
                return (
                  <rect
                    key={t.id}
                    x={cx0 - 6}
                    y={cy - 6}
                    width={12}
                    height={12}
                    rx={2}
                    tabIndex={0}
                    aria-label={say}
                    fill={main ? 'var(--ink)' : 'var(--surface-raised)'}
                    stroke="var(--ink)"
                    strokeWidth={1.5}
                    onMouseEnter={() => setRead(say)}
                    onFocus={() => setRead(say)}
                    onMouseLeave={() => setRead(null)}
                    onBlur={() => setRead(null)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="t-small flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
        {topCause && (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-ink" /> {topCause}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] border-[1.5px] border-ink" /> Other causes
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="8" height="12" aria-hidden>
            <path d="M1 1h6l-3 4z" fill="var(--ink)" />
            <line x1="4" x2="4" y1="4" y2="12" stroke="var(--ink)" strokeWidth="1.5" />
          </svg>
          Roving change
        </span>
      </div>
      <p className="t-small min-h-[18px] text-ink" aria-live="polite">
        {read ?? ''}
      </p>
    </div>
  );
}

// ---------- shift dots: every alert as a dot, minutes to Seen and to fixed ----------
const SHIFT_HOURS: Record<ShiftId, string> = { A: SHIFTS.A.hours.replace(/:00/g, ''), B: SHIFTS.B.hours.replace(/:00/g, ''), C: SHIFTS.C.hours.replace(/:00/g, '') };
const median = (v: number[]) => {
  if (!v.length) return null;
  const a = [...v].sort((p, q) => p - q);
  const k = Math.floor(a.length / 2);
  return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2;
};

export function ShiftDots({ dots, limit = 5, width = 640 }: { dots: ResponseDot[]; limit?: number; width?: number }) {
  const [box, W] = useWidth(width);
  const L = 70, gap = 28, colW = (W - L - gap) / 2, rowH = 46, top = 22;
  const xs = (m: number) => L + (Math.min(m, 12) / 12) * colW;
  const xf = (m: number) => L + colW + gap + (Math.min(m, 120) / 120) * colW;
  const [pick, setPick] = useState<ResponseDot | null>(null);
  const shifts: ShiftId[] = ['A', 'B', 'C'];
  const H = top + rowH * 3 + 18;
  return (
    <div ref={box} className="flex min-w-0 flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Minutes to Seen and to fixed for every alert, by shift">
        <text x={L} y={10} className="fill-[var(--ink-muted)] text-[11px] font-medium tracking-[0.06em]">
          MINUTES TO SEEN
        </text>
        <text x={L + colW + gap} y={10} className="fill-[var(--ink-muted)] text-[11px] font-medium tracking-[0.06em]">
          MINUTES TO FIXED
        </text>
        <rect x={xs(0)} y={top - 4} width={xs(limit) - xs(0)} height={rowH * 3 - 8} rx={3} fill="var(--ok-soft)" />
        <line x1={xs(limit)} x2={xs(limit)} y1={top - 8} y2={top + rowH * 3 - 10} stroke="var(--ink)" strokeWidth={1.5} />
        {shifts.map((sh, r) => {
          const cy = top + r * rowH + rowH / 2 - 6;
          const rows = dots.filter((d) => d.shift === sh);
          const ms = median(rows.map((d) => d.seenMins));
          const fixes = rows.filter((d) => d.fixMins !== undefined).map((d) => d.fixMins!);
          const mf = median(fixes);
          const stack = new Map<number, number>();
          return (
            <g key={sh}>
              <text x={0} y={cy - 2} className="fill-[var(--ink)] text-[13px] font-semibold">
                {sh} shift
              </text>
              <text x={0} y={cy + 12} className="fill-[var(--ink-muted)] font-mono text-[10px]">
                {SHIFT_HOURS[sh]} · {rows.length}
              </text>
              <line x1={xs(0)} x2={xs(12)} y1={cy} y2={cy} stroke="var(--line)" />
              <line x1={xf(0)} x2={xf(120)} y1={cy} y2={cy} stroke="var(--line)" />
              {ms !== null && (
                <>
                  <line x1={xs(ms)} x2={xs(ms)} y1={cy - 12} y2={cy + 12} stroke="var(--ink)" strokeWidth={2} />
                  <text x={xs(12)} y={cy - 13} textAnchor="end" className={cx('font-mono text-[10px] font-semibold', ms > limit ? 'fill-[var(--critical)]' : 'fill-[var(--ink-muted)]')}>
                    median {ms.toFixed(1)}
                  </text>
                </>
              )}
              {mf !== null && (
                <>
                  <line x1={xf(mf)} x2={xf(mf)} y1={cy - 12} y2={cy + 12} stroke="var(--ink)" strokeWidth={2} />
                  <text x={xf(120)} y={cy - 13} textAnchor="end" className="fill-[var(--ink-muted)] font-mono text-[10px] font-semibold">
                    median {Math.round(mf)}
                  </text>
                </>
              )}
              {rows.map((d) => {
                const k = Math.round(d.seenMins);
                const n = stack.get(k) ?? 0;
                stack.set(k, n + 1);
                const dy = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 7;
                const over = d.seenMins > limit;
                const on = pick?.id === d.id;
                return (
                  <g key={d.id} onMouseEnter={() => setPick(d)} onMouseLeave={() => setPick(null)}>
                    <circle
                      cx={xs(d.seenMins)}
                      cy={cy + dy}
                      r={on ? 6.5 : 4.5}
                      tabIndex={0}
                      onFocus={() => setPick(d)}
                      onBlur={() => setPick(null)}
                      aria-label={`${d.frameId}, ${dayMonth(d.at)}, seen in ${d.seenMins.toFixed(1)} minutes`}
                      fill={over ? 'var(--critical)' : 'var(--data)'}
                      stroke="var(--surface-raised)"
                      strokeWidth={1.5}
                      className="anim-fade transition-[r] duration-150"
                    />
                    {d.fixMins !== undefined && <circle cx={xf(d.fixMins)} cy={cy + dy} r={on ? 6.5 : 4.5} fill="var(--neutral-state)" stroke="var(--surface-raised)" strokeWidth={1.5} className="anim-fade transition-[r] duration-150" />}
                  </g>
                );
              })}
            </g>
          );
        })}
        {[0, limit, 10].map((m) => (
          <text key={`s${m}`} x={xs(m)} y={H - 2} textAnchor="middle" className="fill-[var(--ink-muted)] font-mono text-[10px]">
            {m === limit ? `${m} limit` : m}
          </text>
        ))}
        {[0, 60, 120].map((m) => (
          <text key={`f${m}`} x={xf(m)} y={H - 2} textAnchor="middle" className="fill-[var(--ink-muted)] font-mono text-[10px]">
            {m === 120 ? '120+' : m}
          </text>
        ))}
      </svg>
      <p className="t-small min-h-[18px] text-muted" aria-live="polite">
        {pick ? (
          <>
            <span className="font-semibold text-ink">
              {pick.frameId} · {dayMonth(pick.at)} · {pick.shift} shift
            </span>{' '}
            · seen in {pick.seenMins.toFixed(1)} min{pick.seenMins > limit ? ', over the limit' : ''}
            {pick.fixMins !== undefined ? `, fixed ${Math.round(pick.fixMins)} min after the alert` : ', not fixed yet'}
          </>
        ) : (
          'Each dot is one alert. Point at a dot for the frame and the day.'
        )}
      </p>
    </div>
  );
}

// ---------- the escalation relay ----------
export function Relay({ s, t, now, compact }: { s: MillState; t: Ticket; now: number; compact?: boolean }) {
  const esc = escalation(t, now);
  const end = t.escalatePhMins * MIN;
  const m = Math.min(end, esc.elapsed);
  const pct = (m / end) * 100;
  const sup = s.users.find((u) => u.role === 'supervisor' && u.shift === t.shift);
  const stations = [
    { at: 0, who: sup?.name.split(' ')[0] ?? 'Supervisor', role: 'shift supervisor' },
    { at: t.seenMins, who: 'Seen limit', role: `${t.seenMins} min` },
    { at: t.escalateQcMins, who: 'Priya', role: `QC manager · ${t.escalateQcMins}` },
    { at: t.escalatePhMins, who: 'You', role: `plant head · ${t.escalatePhMins}` },
  ];
  const color = esc.level >= 1 ? 'var(--critical)' : esc.timer === 'over' ? 'var(--major-fill)' : 'var(--data)';
  return (
    <div className="flex flex-col gap-3" role="img" aria-label={`${timer(esc.elapsed)} since the alert. Seen limit ${t.seenMins} minutes, QC manager told at ${t.escalateQcMins}, plant head at ${t.escalatePhMins}.`}>
      <div className="relative mx-2 h-2">
        <span className="absolute inset-0 rounded-full bg-[var(--cell-off)]" />
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, background: color }} />
        {stations.map((st, i) => {
          const on = esc.elapsed >= st.at * MIN;
          return (
            <span
              key={i}
              className={cx('absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-300', on && i === 3 && 'anim-pop')}
              style={{ left: `${(st.at / t.escalatePhMins) * 100}%`, background: on ? (i === 3 ? 'var(--critical)' : 'var(--ink)') : 'var(--surface-raised)', borderColor: on ? (i === 3 ? 'var(--critical)' : 'var(--ink)') : 'var(--line-strong)' }}
            />
          );
        })}
      </div>
      <div className="relative h-9">
        {stations.map((st, i) => (
          <span
            key={i}
            className={cx('absolute flex flex-col whitespace-nowrap', i === 0 ? 'left-0 items-start' : i === 3 ? 'right-0 items-end' : '-translate-x-1/2 items-center')}
            style={i === 0 || i === 3 ? undefined : { left: `${(st.at / t.escalatePhMins) * 100}%` }}
          >
            <span className={cx('t-small-strong', esc.elapsed >= st.at * MIN ? 'text-ink' : 'text-muted')}>{compact && i === 1 ? `${t.seenMins} min` : st.who}</span>
            {(!compact || i === 0 || i === 3) && <span className="font-mono text-[11px] text-muted">{compact ? (i === 0 ? 'supervisor' : `${t.escalatePhMins} min`) : st.role}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Who is sitting on an escalated alert, in words. */
export function stuckLine(s: MillState, t: Ticket, now: number) {
  const esc = escalation(t, now);
  const sup = s.users.find((u) => u.role === 'supervisor' && u.shift === t.shift);
  if (t.seenAt) return `${userName(s, t.seenBy).split(' ')[0]} saw it at ${hhmm(t.seenAt)}`;
  return `${sup?.name.split(' ')[0] ?? 'The supervisor'} hasn't tapped Seen in ${Math.floor(esc.elapsed / MIN)} min. Priya was told at ${t.escalateQcMins} min.`;
}

export function holdLine(s: MillState, t: Ticket, now: number) {
  const h = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
  if (!h) return null;
  const kg = holdKg(h, now);
  return { kg, growing: !h.to, perHour: h.kgPerHour };
}

// ---------- decision options ----------
export interface Option<K extends string> {
  key: K;
  title: string;
  consequence: string;
  needsReason: boolean;
}

export function DecisionPanel<K extends string>({
  question,
  options,
  onDecide,
  done,
  compact,
}: {
  question: string;
  options: Option<K>[];
  onDecide: (key: K, reason: string) => void;
  done?: ReactNode;
  compact?: boolean;
}) {
  const [pick, setPick] = useState<K | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const opt = options.find((o) => o.key === pick);
  const missing = !!opt?.needsReason && reason.trim().length < 4;
  const id = useMemo(() => `reason-${Math.random().toString(36).slice(2, 8)}`, []);
  if (done) return <div className="anim-fade flex flex-col gap-3">{done}</div>;
  return (
    <div className="flex flex-col gap-3">
      <p className="t-body-strong">{question}</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={question}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={pick === o.key}
            onClick={() => setPick(o.key)}
            className={cx(
              'flex flex-col gap-0.5 rounded-[10px] border px-3.5 py-3 text-left transition-[background-color,border-color] duration-150',
              pick === o.key ? 'border-ink bg-sunken outline outline-1 outline-ink' : 'border-line-strong bg-raised hover:bg-sunken',
            )}
          >
            <span className="t-body-strong">{o.title}</span>
            <span className="t-small text-muted">{o.consequence}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="t-small-strong">
          Reason {opt && !opt.needsReason ? <span className="font-normal text-muted">(optional)</span> : null}
        </label>
        <textarea
          id={id}
          rows={compact ? 2 : 3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Saved with your name and the time"
          className={cx('t-body resize-none rounded-[10px] border bg-raised px-3 py-2 text-ink placeholder:text-muted', tried && missing ? 'border-critical' : 'border-line-strong')}
        />
        {tried && missing && <p className="t-small text-critical">Write a reason. It goes on the record with this decision.</p>}
      </div>
      <button
        type="button"
        disabled={!opt}
        onClick={() => {
          setTried(true);
          if (!opt || missing) return;
          onDecide(opt.key, reason.trim());
        }}
        className="inline-flex h-12 items-center justify-center rounded-[10px] bg-brand px-5 text-[15px] font-semibold text-on-brand transition-[background-color,transform] duration-150 hover:bg-[var(--brand-hover)] active:scale-[0.98] disabled:opacity-45"
      >
        {opt ? opt.title : 'Pick one option'}
      </button>
    </div>
  );
}

export const stagger = (i: number) => ({ '--i': i }) as CSSProperties;
