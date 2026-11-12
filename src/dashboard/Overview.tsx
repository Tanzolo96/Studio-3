import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Locked } from '@carbon/icons-react';
import type { MillState, Ticket } from '../engine/types';
import { useMillState, useNow, useTheme, useUser } from '../store/store';
import { bySeverityThenAge, escalation, frameView, holdNeedsApproval, isEscalated, median, pendingRequests, seenTimes, type FrameStateKind } from '../engine/selectors';
import { frameWord, holdKg, roundKg, userName } from '../engine/reducer';
import { insights } from '../engine/insights';
import { BASELINE_KG, alertHeat, dailyAlerts, frameStateCounts, seenTrend, shiftResponse, ticketsSince, topCauses, yarnSaved } from '../engine/analytics';
import { DAY, ago, dayMonth, hhmm, mill, millDayKey, shiftAt, shiftEndsAt, timer } from '../engine/time';
import { cx, Empty, SeverityBadge, StatusChip } from '../ui/primitives';
import { InsightCard, readingLine, ticketChip } from '../ui/cards';
import { BarList, CountUp, Ring, Sparkline, SeverityLegend, ShiftBars, StackedColumns, TrendArea } from '../ui/charts';
import { PageHead } from './DashShell';

export function Panel({ title, sub, aside, children, className }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex min-w-0 flex-col rounded-[12px] border border-line bg-raised p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-label text-muted">{title}</h2>
          {sub && <p className="t-small mt-1 text-muted">{sub}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function QcOverview() {
  const theme = useTheme('dash');
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const nav = useNavigate();

  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed').sort(bySeverityThenAge);
  const incidents = live.filter((t) => t.severity !== 'minor');
  const nowMin = Math.floor(now / 60000);
  const a = useMemo(() => {
    const since30 = mill(millDayKey(now)) - 29 * DAY;
    const month = ticketsSince(s, since30, now);
    return { daily: dailyAlerts(s, now, 30), trend: seenTrend(s, now, 30), saved: yarnSaved(s, now, since30), month };
    // recompute once a mill minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, nowMin]);
  const states = frameStateCounts(s, now);
  const isPlant = user.role === 'plant';
  const waiting = s.holds.filter((h) => h.status === 'on_hold' && holdNeedsApproval(h));

  const seenNow = [...a.trend].reverse().find((p) => p.mins !== null)?.mins ?? null;
  const serious = a.month.filter((t) => t.severity !== 'minor' && t.seenAt);
  const inTime = serious.filter((t) => (t.seenAt as number) - t.alertAt <= 5 * 60000).length;
  const inTimePct = serious.length ? Math.round((inTime / serious.length) * 100) : 100;
  const calmDays = a.daily.filter((d) => d.critical === 0).length;
  const saved = a.saved;
  const lessLost = Math.max(0, Math.round(100 - (saved.avgHeld / BASELINE_KG) * 100));
  const doneCount = a.month.filter((t) => t.status === 'closed' || t.status === 'fixed').length;
  const resolvedPct = a.month.length ? Math.round((doneCount / a.month.length) * 100) : 100;
  const recent = s.tickets
    .filter((t) => (t.status === 'closed' || t.status === 'fixed') && t.createdAt <= now)
    .sort((x, y) => (y.closedAt ?? y.createdAt) - (x.closedAt ?? x.createdAt))
    .slice(0, 3);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(now + 5.5 * 3600000).getUTCDay()];

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="anim-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-page">Overview</h1>
          <p className="t-small mt-0.5 text-muted">
            {weekday} {dayMonth(now)} · {shiftAt(now)} shift · {hhmm(now)}
          </p>
        </div>
        <p className="t-small-strong flex items-center gap-2">
          <span className={cx('size-2 rounded-full', incidents.length ? 'bg-critical' : 'bg-ok')} />
          {incidents.length ? `${incidents.length} live alert${incidents.length > 1 ? 's' : ''}` : 'No live alerts'}
        </p>
      </header>

      {incidents.length > 0 && (
        <section aria-label="Live alerts" className="flex flex-col gap-3">
          {incidents.map((t) => (
            <IncidentCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/dashboard/tickets/${t.id}`)} />
          ))}
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-3" aria-label="Key numbers">
        <Goal
          i={1}
          label="Time to Seen"
          value={seenNow !== null ? <CountUp value={seenNow * 60} format={(v) => timer(v * 1000)} /> : '–'}
          chart={<Sparkline values={a.trend.map((p) => p.mins)} color="var(--brand)" limit={5} height={46} label="Median minutes to Seen over 30 days, dashed line is the 5 minute limit" />}
          goal="5:00"
          badge={seenNow === null ? undefined : seenNow <= 5 ? { text: 'On target', tone: 'good' } : { text: 'Over limit', tone: 'bad' }}
          note="Median minutes from alert to Seen, last 7 days"
        />
        <Goal
          i={2}
          label="Seen in time"
          value={<CountUp value={inTimePct} format={(v) => `${Math.round(v)}%`} />}
          chart={<TargetBar pct={inTimePct} target={90} />}
          goal="90%"
          badge={inTimePct >= 90 ? { text: 'On target', tone: 'good' } : { text: `${90 - inTimePct}% short`, tone: 'bad' }}
          note={`${inTime} of ${serious.length} alerts seen within 5 min, last 30 days`}
        />
        <Goal
          i={3}
          label="Held per incident"
          value={<CountUp value={saved.avgHeld} />}
          chart={<TargetBar pct={Math.round((saved.avgHeld / BASELINE_KG) * 100)} />}
          unit="kg"
          goal={`${BASELINE_KG} kg`}
          badge={{ text: `${lessLost}% less`, tone: 'good' }}
          note={`${roundKg(saved.saved).toLocaleString('en-IN')} kg saved in 30 days against the old ${BASELINE_KG} kg`}
        />
      </section>

      {user.role === 'qc' && <WaitingForYou s={s} now={now} />}

      {isPlant && (
        <Panel
          title="Waiting for your approval"
          sub={waiting.length ? `${waiting.length} decision${waiting.length > 1 ? 's' : ''} need the plant head` : 'Nothing waiting'}
          aside={
            <Link to="/dashboard/held" className="t-small-strong flex items-center gap-1 text-brand hover:underline">
              Held yarn <ArrowRight size={14} />
            </Link>
          }
        >
          {waiting.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {waiting.map((h) => (
                <li key={h.id}>
                  <Link to="/dashboard/held" className="flex items-center gap-4 py-2.5 hover:bg-sunken">
                    <span className="t-data">{h.frameId}</span>
                    <span className="t-small flex-1 text-muted">
                      Lot {h.lotId} · {roundKg(holdKg(h, now))} kg held
                    </span>
                    <span className="t-small-strong text-brand">Review</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-small text-muted">Big decisions that the QC manager cannot close alone appear here.</p>
          )}
        </Panel>
      )}

      <div className="anim-in grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" style={{ '--i': 4 } as CSSProperties}>
        <section data-theme={theme === 'day' ? 'night' : undefined} className="flex flex-col rounded-[12px] border-t-2 border-t-[var(--brand)] p-5 text-ink ring-1 ring-[var(--line)]" style={{ background: 'var(--focus-surface)' }}>
          <header className="flex items-center justify-between">
            <h2 className="t-label text-muted">Needs attention</h2>
            <Link to="/dashboard/tickets" className="t-small-strong flex items-center gap-1 text-brand hover:underline">
              All tickets <ArrowRight size={14} />
            </Link>
          </header>
          {live.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-[var(--line)]">
              {live.slice(0, 4).map((t, n) => {
                const mins = (now - t.alertAt) / 60000;
                const pct = Math.min(100, Math.round((mins / t.escalateQcMins) * 100));
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="block w-full py-3 text-left hover:opacity-90">
                      <div className="flex items-center gap-3">
                        <span className="t-body-strong">{t.frameId}</span>
                        <span className="t-small min-w-0 flex-1 truncate text-muted">{t.title}</span>
                        <SeverityBadge level={t.severity} />
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${Math.round(mins)} of ${t.escalateQcMins} minutes before escalation`}>
                          <div className={cx('anim-grow-x h-full rounded-full', pct >= 100 ? 'bg-critical' : 'bg-brand')} style={{ width: `${pct}%`, '--i': n } as CSSProperties} />
                        </div>
                        <span className="t-data whitespace-nowrap text-[12px] text-muted">
                          {mins > t.escalateQcMins ? `open ${ago(now - t.alertAt)}` : `${Math.round(mins)} / ${t.escalateQcMins} min`}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="t-body mt-6 pb-4 text-muted">Nothing needs attention. Every frame is running normally.</p>
          )}
          <div className="mt-auto pt-5">
            <h3 className="t-label border-t border-line pt-4 text-muted">Recently resolved</h3>
            <ul className="mt-2 flex flex-col">
              {recent.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="flex w-full items-center gap-3 py-2 text-left hover:opacity-90">
                    <span className="t-data">{t.frameId}</span>
                    <span className="t-small min-w-0 flex-1 truncate text-muted">{t.title}</span>
                    <span className="t-data text-[12px] text-muted">{dayMonth(t.closedAt ?? t.createdAt)}, {hhmm(t.closedAt ?? t.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="divide-y divide-[var(--line)] rounded-[12px] border border-line bg-raised" aria-label="Health">
          <GaugeRow i={0} label="Frames running" value={`${states.running}`} goal={`${s.frames.length}`} pct={Math.round((states.running / s.frames.length) * 100)} />
          <GaugeRow i={1} label="Calm days, 30 days" value={`${calmDays}`} goal="30" pct={Math.round((calmDays / 30) * 100)} />
          <GaugeRow i={2} label="Holds decided" value={`${s.holds.filter((h) => h.status !== 'on_hold').length}`} goal={`${s.holds.length}`} pct={s.holds.length ? Math.round((s.holds.filter((h) => h.status !== 'on_hold').length / s.holds.length) * 100) : 100} />
          <GaugeRow i={3} label="Tickets resolved" value={`${doneCount}`} goal={`${a.month.length}`} pct={resolvedPct} />
        </section>
      </div>

      <div className={cx('anim-in grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]', isPlant && 'hidden')} style={{ '--i': 5 } as CSSProperties}>
        <Panel
          title="Ring frames, floor order"
          sub={`${states.running} of ${s.frames.length} running normally${states.stopped ? `, ${states.stopped} stopped for doffing` : ''}`}
          aside={
            <Link to="/dashboard/machines" className="t-small-strong flex items-center gap-1 text-brand hover:underline">
              Machines <ArrowRight size={14} />
            </Link>
          }
        >
          <FloorMap s={s} now={now} onOpen={(id) => nav(`/dashboard/machines/${id}`)} />
          <ul className="t-small mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-muted" aria-label="Legend">
            <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ok" />Running {states.running}</li>
            {states.warning > 0 && <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-major-fill" />Warning {states.warning}</li>}
            {states.fault > 0 && <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-critical" />Failed {states.fault}</li>}
            {states.held > 0 && <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" />On hold {states.held}</li>}
            {states.stopped > 0 && <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--line-strong)]" />Stopped {states.stopped}</li>}
          </ul>
        </Panel>
        <CalendarPanel s={s} now={now} onOpen={(id) => nav(`/dashboard/tickets/${id}`)} />
      </div>
    </div>
  );
}

function Goal({ i = 0, label, value, unit, goal, badge, note, chart }: { i?: number; label: string; value: ReactNode; unit?: string; goal?: string; badge?: { text: string; tone: 'good' | 'bad' }; note: string; chart?: ReactNode }) {
  return (
    <div className="anim-in lift flex flex-col rounded-[12px] border border-line bg-raised p-5" style={{ '--i': i } as CSSProperties}>
      <div className="flex items-start justify-between gap-2">
        <p className="t-label min-w-0 truncate text-muted">{label}</p>
        {badge && <span className={cx('t-label shrink-0 whitespace-nowrap rounded-[4px] px-1.5 text-[10px]', badge.tone === 'good' ? 'bg-ok-soft text-ok' : 'bg-critical-soft text-critical')}>{badge.text}</span>}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="t-stat !text-[34px] !leading-[38px]">{value}</span>
        {unit && <span className="t-body text-muted">{unit}</span>}
        {goal && <span className="t-stat !text-[22px] !leading-[28px] !font-normal text-neutral">/ {goal}</span>}
      </p>
      {chart && <div className="mt-4">{chart}</div>}
      <p className="t-small mt-3 text-muted">{note}</p>
    </div>
  );
}

function TargetBar({ pct, target }: { pct: number; target?: number }) {
  const ok = target !== undefined && pct >= target;
  return (
    <div role="img" aria-label={target !== undefined ? `${pct}% against a ${target}% target` : `${pct}% of the old amount`}>
      <div className="relative h-3 rounded-full bg-sunken">
        <div className={cx('anim-grow-x h-full rounded-full', ok ? 'bg-ok' : 'bg-brand')} style={{ width: `${pct}%` }} />
        {target !== undefined && <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink" style={{ left: `${target}%` }} title={`Target ${target}%`} />}
      </div>
    </div>
  );
}

function GaugeRow({ i = 0, label, value, goal, pct, invert }: { i?: number; label: string; value: string; goal: string; pct: number; invert?: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  const tone = invert ? 'var(--ink)' : p >= 80 ? 'var(--ok)' : p >= 40 ? 'var(--major-fill)' : 'var(--critical)';
  const len = Math.PI * 44;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-sunken">
      <div className="min-w-0">
        <p className="t-label text-[10px] text-muted">{label}</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="t-stat !text-[24px] !leading-[28px]">{value}</span>
          <span className="t-body text-neutral">/ {goal}</span>
        </p>
      </div>
      <div className="relative h-[60px] w-[104px] shrink-0" role="img" aria-label={`${label}: ${p}%`}>
        <svg viewBox="0 0 104 58" className="h-full w-full">
          <path d="M8 52 A44 44 0 0 1 96 52" fill="none" stroke="var(--grid)" strokeWidth="9" strokeLinecap="round" />
          <path d="M8 52 A44 44 0 0 1 96 52" fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(len * p) / 100} ${len}`} className="anim-gauge" style={{ '--i': i } as CSSProperties} />
        </svg>
        <span className="absolute inset-x-0 bottom-0 text-center text-[17px] font-semibold leading-none tabular-nums">
          <CountUp value={p} format={(v) => `${Math.round(v)}%`} ms={1300} />
        </span>
      </div>
    </div>
  );
}

const TILE: Record<FrameStateKind, string> = {
  running: 'bg-[var(--tile-run)] text-ink border-transparent hover:border-[var(--ok)]',
  warning: 'bg-major-soft text-major border-[var(--major-fill)]',
  fault: 'bg-critical text-on-critical border-critical pulse-critical',
  held: 'bg-brand-soft text-brand border-[var(--brand)]',
  stopped: 'bg-transparent text-muted border-dashed border-line-strong',
};
const SHORT: Record<FrameStateKind, string> = { running: 'Run', warning: 'Warning', fault: 'Failed', held: 'On hold', stopped: 'Stopped' };

function FloorMap({ s, now, onOpen }: { s: MillState; now: number; onOpen: (id: string) => void }) {
  const rows = [s.frames.slice(0, 8), s.frames.slice(8, 16), s.frames.slice(16, 24)];
  const [hover, setHover] = useState<string | null>(null);
  const hv = hover ? frameView(s, hover, now) : undefined;
  const hf = hover ? s.frames.find((f) => f.id === hover) : undefined;
  const product = hf ? s.products.find((p) => p.id === s.lots.find((l) => l.id === hf.lotId)!.productId) : undefined;
  const sisters = hf ? s.frames.filter((f) => f.lotId === hf.lotId).length : 0;
  return (
    <div className="flex flex-1 flex-col gap-2">
      {rows.map((row, r) => (
        <div key={r} className="grid flex-1 grid-cols-[48px_repeat(8,minmax(0,1fr))] items-stretch gap-2">
          <span className="t-small self-center text-muted">Row {r + 1}</span>
          {row.map((f, c) => {
            const v = frameView(s, f.id, now);
            const sister = hf && f.lotId === hf.lotId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onOpen(f.id)}
                onMouseEnter={() => setHover(f.id)}
                onFocus={() => setHover(f.id)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
                aria-label={`${f.id}: ${v.label}. Lot ${f.lotId}. ${v.line}`}
                style={{ '--i': r * 8 + c } as CSSProperties}
                className={cx(
                  'flex min-h-[60px] min-w-0 flex-col items-center justify-center rounded-[10px] border transition-[opacity,box-shadow,border-color] duration-200',
                  v.kind !== 'fault' && 'anim-pop',
                  TILE[v.kind],
                  hf && !sister && 'opacity-40',
                  sister && 'ring-2 ring-[var(--brand)]',
                )}
              >
                <span className="t-body-strong tabular-nums">{f.num}</span>
                <span className="text-[11px] leading-4 opacity-70">{v.kind === 'running' ? f.lotId : SHORT[v.kind]}</span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="t-small mt-2 min-h-5 truncate text-muted" aria-live="polite">
        {hf && hv ? (
          <>
            <span className="font-semibold text-ink">{hf.id}</span> · {product?.short} · Lot {hf.lotId} · {hv.label}
            {sisters > 1 ? ` · ${sisters} frames on this lot` : ''}
          </>
        ) : (
          'Point at a frame to see it and the other frames on its lot.'
        )}
      </p>
    </div>
  );
}

// ---------- a live incident, told as a story ----------
function IncidentCard({ s, t, now, onOpen }: { s: MillState; t: Ticket; now: number; onOpen: () => void }) {
  const esc = escalation(t, now);
  const hold = t.holdId ? s.holds.find((h) => h.id === t.holdId) : undefined;
  const critical = t.severity === 'critical';
  const steps = [
    { word: 'Alert sent', at: t.alertAt },
    { word: 'Seen', at: t.seenAt },
    { word: 'Working on it', at: t.workingAt },
    { word: 'Fixed', at: t.fixedAt },
  ];
  const current = steps.findIndex((x) => !x.at);
  const who = t.seenBy ? userName(s, t.seenBy).split(' ')[0] : esc.level === 2 ? 'Plant head told' : esc.level === 1 ? 'QC manager told' : `${t.shift} shift supervisor`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'anim-rise grid w-full items-center gap-6 rounded-[16px] border p-5 text-left shadow-raised md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto]',
        critical ? 'border-critical bg-critical-soft' : 'border-major-fill bg-major-soft',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge level={t.severity} className="bg-raised" />
          <StatusChip kind={ticketChip(t, now)} className="bg-raised" />
        </div>
        <p className="t-section mt-2">
          {frameWord(t.frameId)} · {t.kind === 'drift' ? 'winding drift, lab test asked' : t.title.toLowerCase()}
        </p>
        <p className="t-data mt-1">{readingLine(s, t)}</p>
        {t.sisterFrames.length > 0 && (
          <p className="t-small mt-2 text-ink">
            Sister frames checked: {t.sisterFrames.map((f) => Number(f.slice(3))).join(' and ')}
          </p>
        )}
      </div>

      <ol className="grid grid-cols-4 gap-1" aria-label="Progress">
        {steps.map((st, i) => (
          <li key={st.word} className="flex flex-col gap-1.5">
            <span className={cx('h-1.5 rounded-full', st.at ? (critical ? 'bg-critical' : 'bg-major-fill') : i === current ? 'bg-line-strong' : 'bg-[var(--grid)]')} />
            <span className={cx('t-small', st.at ? 'font-semibold text-ink' : 'text-muted')}>{st.word}</span>
            <span className="t-data text-[12px] text-muted">{st.at ? hhmm(st.at) : i === current ? 'waiting' : ''}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-5">
        {t.status === 'open' ? (
          <Ring value={esc.elapsed} max={t.seenMins * 60000} color={esc.timer === 'ok' ? 'var(--neutral-state)' : esc.timer === 'warn' ? 'var(--major-fill)' : 'var(--critical)'} size={72} label={`${timer(esc.elapsed)} since the alert, limit ${t.seenMins} minutes`}>
            <span className={cx('t-data text-[13px]', esc.timer === 'over' && 'font-semibold text-critical')}>{timer(esc.elapsed)}</span>
          </Ring>
        ) : (
          <div className="text-right">
            <p className="t-small text-muted">Seen in</p>
            <p className="t-data">{timer(esc.elapsed)}</p>
          </div>
        )}
        <div className="min-w-[96px]">
          <p className="t-small text-muted">{t.status === 'open' ? 'Waiting on' : 'Owner'}</p>
          <p className="t-small-strong">{who}</p>
          {hold && (
            <p className="mt-2">
              <span className="t-stat text-held">{roundKg(holdKg(hold, now))}</span>
              <span className="t-small ml-1 text-held">kg held</span>
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function Report() {
  const s = useMillState();
  const now = useNow();
  const nowMin = Math.floor(now / 60000);
  const a = useMemo(() => {
    const since30 = mill(millDayKey(now)) - 29 * DAY;
    const month = ticketsSince(s, since30, now);
    const serious = month.filter((t) => t.severity !== 'minor');
    const byFrame = new Map<string, number>();
    for (const t of serious) byFrame.set(t.frameId, (byFrame.get(t.frameId) ?? 0) + 1);
    const frames = [...byFrame.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
    const holds = s.holds.filter((h) => h.from >= since30 && h.from <= now);
    return {
      daily: dailyAlerts(s, now, 30),
      trend: seenTrend(s, now, 30),
      causes: topCauses(month).slice(0, 6),
      shifts: shiftResponse(month),
      heat: alertHeat(s, now, 30),
      serious,
      crit: serious.filter((t) => t.severity === 'critical').length,
      frames,
      heldKg: holds.reduce((n, h) => n + holdKg(h, now), 0),
      holds: holds.length,
    };
    // recompute once a mill minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, nowMin]);
  const seenNow = [...a.trend].reverse().find((p) => p.mins !== null)?.mins ?? null;
  const top = a.frames[0];
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <PageHead title="Monthly report" sub="Last 30 days" />

      <section className="anim-in grid grid-cols-2 divide-x divide-y divide-[var(--line)] overflow-hidden rounded-[12px] border border-line bg-raised lg:grid-cols-4 lg:divide-y-0" aria-label="Month in numbers">
        <ReportStat label="Critical and major alerts" value={<CountUp value={a.serious.length} />} note={`${a.crit} critical`} />
        <ReportStat label="Median time to Seen" value={seenNow !== null ? <CountUp value={seenNow * 60} format={(v) => timer(v * 1000)} /> : '–'} note="Limit 5:00" tone={seenNow !== null && seenNow > 5 ? 'bad' : 'good'} />
        <ReportStat label="Yarn held" value={<CountUp value={a.heldKg} format={(v) => `${Math.round(v).toLocaleString('en-IN')} kg`} />} note={`${a.holds} hold${a.holds === 1 ? '' : 's'}, about ${a.holds ? Math.round(a.heldKg / a.holds) : 0} kg each`} />
        <ReportStat label="Frame with most alerts" value={top ? top.name : '–'} note={top ? `${top.value} alert${top.value === 1 ? '' : 's'} this month` : 'No alerts'} tone={top && top.value >= 3 ? 'bad' : undefined} />
      </section>

      <div className="anim-in grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" style={{ '--i': 1 } as CSSProperties}>
        <AlertHeat grid={a.heat} />
        <Panel title="Frames with most alerts" sub="Critical and major, last 30 days">
          {a.frames.length ? <BarList items={a.frames} format={(v) => `${v}`} /> : <p className="t-small text-muted">No alerts this month.</p>}
          <p className="t-small mt-auto pt-4 text-muted">Frames that keep coming back are worth a deeper check, not another quick fix.</p>
        </Panel>
      </div>

      <div className="anim-in grid gap-4 xl:grid-cols-3" style={{ '--i': 2 } as CSSProperties}>
        <Panel className="xl:col-span-2" title="Alerts per day" sub="Last 30 days, by severity" aside={<SeverityLegend />}>
          <StackedColumns data={a.daily} dayLabel={dayMonth} label="Alerts per day for the last 30 days, by severity" />
        </Panel>
        <Panel title="Top causes" sub="What fixed frames had in common">
          {a.causes.length ? <BarList items={a.causes} /> : <p className="t-small text-muted">No fixed tickets yet.</p>}
        </Panel>
      </div>

      <div className="anim-in grid gap-4 xl:grid-cols-3" style={{ '--i': 3 } as CSSProperties}>
        <Panel className="xl:col-span-2" title="How fast alerts are seen" sub="Median minutes from alert to Seen, rolling 7 days">
          <TrendArea
            points={a.trend}
            limit={5}
            limitLabel="5 min limit"
            format={(v) => `${v.toFixed(1)} min to Seen`}
            dayLabel={dayMonth}
            label="Median minutes to Seen over the last 30 days, against the 5 minute limit"
          />
        </Panel>
        <Panel title="By shift" sub="Median minutes to Seen">
          <div className="pt-6">
            <ShiftBars rows={a.shifts} limit={5} label="Median minutes to Seen for shifts A, B and C" />
          </div>
          <p className="t-small mt-4 text-muted">A 00–08 · B 08–16 · C 16–24</p>
        </Panel>
      </div>
    </div>
  );
}

function ReportStat({ label, value, note, tone }: { label: string; value: ReactNode; note: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="p-5">
      <p className="t-label text-[10px] text-muted">{label}</p>
      <p className="t-stat mt-2">{value}</p>
      <p className={cx('t-small mt-1', tone === 'good' ? 'text-ok' : tone === 'bad' ? 'text-critical' : 'text-muted')}>{note}</p>
    </div>
  );
}

export function InsightsPage() {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const list = insights(s, now).filter((i) => !dismissed.includes(i.id));
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <PageHead title="AI insights" sub="Patterns the data shows, each with its evidence" />
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((i) => (
            <InsightCard key={i.id} insight={{ ...i, onAction: () => nav(i.target) }} onDismiss={() => setDismissed((d) => [...d, i.id])} />
          ))}
        </div>
      ) : (
        <Empty title="No new insights" body="Insights appear when the data shows a pattern worth a look." />
      )}
    </div>
  );
}

const HOURS = ['00', '03', '06', '09', '12', '15', '18', '21'];
const DAYS7 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function AlertHeat({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const [hover, setHover] = useState<[number, number] | null>(null);
  let peak: [number, number] = [0, 0];
  grid.forEach((row, r) => row.forEach((v, c) => { if (v > grid[peak[0]][peak[1]]) peak = [r, c]; }));
  const peakV = grid[peak[0]][peak[1]];
  const rowTotals = grid.map((row) => row.reduce((n, v) => n + v, 0));
  const shade = (v: number) => (v ? `color-mix(in srgb, var(--brand) ${Math.round(22 + (v / max) * 78)}%, var(--surface-raised))` : 'var(--surface-sunken)');
  const end = (c: number) => String((c + 1) * 3).padStart(2, '0');
  const info = hover
    ? `${DAYS7[hover[0]]} ${HOURS[hover[1]]}:00–${end(hover[1])}:00 · ${grid[hover[0]][hover[1]]} alert${grid[hover[0]][hover[1]] === 1 ? '' : 's'}`
    : peakV
      ? `Busiest: ${DAYS7[peak[0]]} ${HOURS[peak[1]]}:00–${end(peak[1])}:00, ${peakV} alert${peakV === 1 ? '' : 's'}`
      : 'No alerts in the last 30 days';
  return (
    <Panel title="When alerts happen" sub="Critical and major, last 30 days, by weekday and 3-hour block">
      <div role="img" aria-label={`Heat map of critical and major alerts by weekday and 3-hour block. ${info}`} className="grid grid-cols-[36px_repeat(8,minmax(0,1fr))_32px] items-center gap-1.5">
        <span />
        {HOURS.map((h) => (
          <span key={h} className="t-data text-center text-[11px] text-muted">
            {h}
          </span>
        ))}
        <span className="t-data text-right text-[11px] text-muted">Σ</span>
        {grid.map((row, r) => (
          <div key={DAYS7[r]} className="contents">
            <span className="t-small text-muted">{DAYS7[r]}</span>
            {row.map((v, c) => {
              const isPeak = peakV > 0 && r === peak[0] && c === peak[1];
              return (
                <span
                  key={c}
                  onMouseEnter={() => setHover([r, c])}
                  onMouseLeave={() => setHover(null)}
                  className={cx('anim-pop grid h-9 place-items-center rounded-[8px] text-[12px] font-semibold tabular-nums transition-transform hover:scale-105', isPeak && 'ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--surface-raised)]')}
                  style={{ background: shade(v), color: v / max > 0.5 ? 'var(--on-brand)' : 'var(--ink)', '--i': r * 8 + c } as CSSProperties}
                >
                  {v || ''}
                </span>
              );
            })}
            <span className="t-data text-right text-[12px] text-muted">{rowTotals[r]}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-small-strong" aria-live="polite">{info}</p>
        <div className="t-small flex items-center gap-1.5 text-muted" aria-hidden>
          Fewer
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <span key={k} className="size-3.5 rounded-[4px]" style={{ background: k ? shade(Math.max(1, Math.round(k * max))) : 'var(--surface-sunken)' }} />
          ))}
          More
        </div>
      </div>
    </Panel>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function CalendarPanel({ s, now, onOpen }: { s: MillState; now: number; onOpen: (id: string) => void }) {
  const ist = new Date(now + 5.5 * 3600000);
  const [view, setView] = useState({ y: ist.getUTCFullYear(), m: ist.getUTCMonth() });
  const todayKey = millDayKey(now);
  const [picked, setPicked] = useState(todayKey);
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (d: number) => `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
  const lead = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const byDay = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of s.tickets) {
      if (t.createdAt > now || t.severity === 'minor') continue;
      const k = millDayKey(t.createdAt);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [s.tickets, now]);
  const firstKey = useMemo(() => s.tickets.reduce((m, t) => { const k = millDayKey(t.createdAt); return k < m ? k : m; }, todayKey), [s.tickets, todayKey]);
  const kinds = Array.from({ length: dim }, (_, i) => {
    const k = key(i + 1);
    const list = byDay.get(k) ?? [];
    if (k > todayKey) return 'future';
    if (list.some((t) => t.severity === 'critical')) return 'critical';
    if (list.length) return 'major';
    return k >= firstKey ? 'calm' : 'none';
  });
  const count = (kind: string) => kinds.filter((x) => x === kind).length;
  const day = (byDay.get(picked) ?? []).slice().sort((a, b) => a.createdAt - b.createdAt);
  const step = (n: number) => setView((v) => ({ y: v.y + Math.floor((v.m + n) / 12), m: (v.m + n + 12) % 12 }));
  const btn = 'grid size-8 place-items-center rounded-[8px] text-muted hover:bg-sunken hover:text-ink';
  return (
    <Panel
      title={`${MONTH_NAMES[view.m]} ${view.y}`}
      sub="Critical and major alerts"
      aside={
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className={btn}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className={btn}>
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-[8px] bg-critical-soft px-3 py-2">
          <p className="t-stat !text-[20px] !leading-[24px] text-critical">{count('critical')}</p>
          <p className="t-small text-critical">Critical days</p>
        </div>
        <div className="rounded-[8px] bg-major-soft px-3 py-2">
          <p className="t-stat !text-[20px] !leading-[24px] text-major">{count('major')}</p>
          <p className="t-small text-major">Major days</p>
        </div>
        <div className="rounded-[8px] bg-ok-soft px-3 py-2">
          <p className="t-stat !text-[20px] !leading-[24px] text-ok">{count('calm')}</p>
          <p className="t-small text-ok">Calm days</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <span key={d} className="t-small pb-1 text-neutral">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const d = i + 1;
          const k = key(d);
          const list = byDay.get(k) ?? [];
          const kind = kinds[i];
          const isPicked = k === picked;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setPicked(k)}
              aria-pressed={isPicked}
              style={{ '--i': i } as CSSProperties}
              aria-label={`${d} ${MONTH_NAMES[view.m]}, ${list.length} alert${list.length === 1 ? '' : 's'}`}
              className={cx(
                'anim-pop t-small relative mx-auto flex size-10 items-center justify-center rounded-[10px] font-medium transition-transform hover:scale-110',
                isPicked
                  ? 'bg-brand font-semibold text-on-brand'
                  : kind === 'critical'
                    ? 'bg-critical-soft text-critical'
                    : kind === 'major'
                      ? 'bg-major-soft text-major'
                      : kind === 'calm'
                        ? 'bg-ok-soft text-ok'
                        : kind === 'future'
                          ? 'text-[var(--line-strong)]'
                          : 'text-muted',
                k === todayKey && !isPicked && 'ring-2 ring-[var(--brand)]',
              )}
            >
              {d}
              {list.length > 1 && (
                <span className={cx('absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold', isPicked ? 'bg-ink text-surface' : kind === 'critical' ? 'bg-critical text-on-critical' : 'bg-major-fill text-ink')}>{list.length}</span>
              )}
            </button>
          );
        })}
      </div>
      <ul className="t-small mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-critical" />Critical</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-major-fill" />Major</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-ok" />Calm</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-brand" />Selected</li>
      </ul>
      <div className="mt-4 border-t border-line pt-3">
        <p className="t-small-strong mb-2">{picked === todayKey ? 'Today' : dayMonth(mill(picked))}</p>
        {day.length ? (
          <ul className="flex flex-col gap-1">
            {day.slice(0, 3).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpen(t.id)} className="flex w-full items-center gap-2 rounded-[10px] px-1 py-1.5 text-left hover:bg-sunken">
                  <SeverityBadge level={t.severity} />
                  <span className="t-data">{t.frameId}</span>
                  <span className="t-data ml-auto text-[13px] text-muted">{hhmm(t.createdAt)}</span>
                </button>
              </li>
            ))}
            {day.length > 3 && <li className="t-small px-1 text-muted">and {day.length - 3} more</li>}
          </ul>
        ) : (
          <p className="t-small text-muted">No critical or major alerts.</p>
        )}
      </div>
    </Panel>
  );
}

/** Each role opens its own home page. */
export function Overview() {
  const user = useUser('dash');
  if (user.role === 'supervisor') return <ShiftOverview />;
  if (user.role === 'plant') return <PlantOverview />;
  return <QcOverview />;
}

const SHIFT_HOURS: Record<string, string> = { A: '00:00–08:00', B: '08:00–16:00', C: '16:00–24:00' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------- supervisor: running the shift ----------
function ShiftOverview() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const nav = useNavigate();
  const shift = user.shift === 'G' ? shiftAt(now) : user.shift;
  const onShift = shift === shiftAt(now);
  const left = Math.max(0, shiftEndsAt(now) - now);
  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed').sort(bySeverityThenAge);
  const mine = live.filter((t) => t.shift === shift || t.seenBy === user.id);
  const incidents = mine.filter((t) => t.severity !== 'minor');
  const withFitters = live.filter((t) => t.fitterId);
  const states = frameStateCounts(s, now);
  const since30 = mill(millDayKey(now)) - 29 * DAY;
  const myDone = s.tickets.filter((t) => t.seenBy === user.id && t.createdAt >= since30 && t.createdAt <= now);
  const myMedian = median(seenTimes(myDone));
  const notes = live.filter((t) => t.handover);
  const recentMine = s.tickets
    .filter((t) => (t.status === 'closed' || t.status === 'fixed') && t.shift === shift && t.createdAt <= now)
    .sort((x, y) => (y.closedAt ?? y.createdAt) - (x.closedAt ?? x.createdAt))
    .slice(0, 4);
  const weekday = WEEKDAYS[new Date(now + 5.5 * 3600000).getUTCDay()];
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="anim-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-page">My shift</h1>
          <p className="t-small mt-0.5 text-muted">
            {weekday} {dayMonth(now)} · {shift} shift {SHIFT_HOURS[shift]} · {onShift ? `${ago(left)} left` : 'off shift'}
          </p>
        </div>
        <p className="t-small-strong flex items-center gap-2">
          <span className={cx('size-2 rounded-full', incidents.length ? 'bg-critical' : 'bg-ok')} />
          {incidents.length ? `${incidents.length} live alert${incidents.length > 1 ? 's' : ''} on your shift` : 'Your shift is calm'}
        </p>
      </header>

      {incidents.length > 0 && (
        <section aria-label="Live alerts" className="flex flex-col gap-3">
          {incidents.map((t) => (
            <IncidentCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/dashboard/tickets/${t.id}`)} />
          ))}
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-3" aria-label="Key numbers">
        <Goal i={1} label="Open on my shift" value={<CountUp value={mine.length} />} badge={!mine.length ? { text: 'All clear', tone: 'good' } : mine.some((t) => isEscalated(t, now)) ? { text: `${mine.filter((t) => isEscalated(t, now)).length} escalated`, tone: 'bad' } : { text: 'None escalated', tone: 'good' }} note="Tickets not yet fixed" />
        <Goal i={2} label="My time to Seen" value={myMedian ? <CountUp value={myMedian / 1000} format={(v) => timer(v * 1000)} /> : '–'} goal="5:00" badge={myMedian ? (myMedian <= 5 * 60000 ? { text: 'On target', tone: 'good' } : { text: 'Over limit', tone: 'bad' }) : undefined} note={`Median over ${myDone.length} alerts you handled, last 30 days`} />
        <Goal i={3} label="Frames running" value={<CountUp value={states.running} />} goal={`${s.frames.length}`} badge={states.fault ? { text: `${states.fault} failed`, tone: 'bad' } : { text: 'No faults', tone: 'good' }} note={`${states.held} on hold · ${states.stopped} stopped for doffing`} />
      </section>

      <div className="anim-in grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" style={{ '--i': 4 } as CSSProperties}>
        <AttentionPanel s={s} now={now} tickets={mine} title="Needs attention on my shift" recent={recentMine} />
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="With fitters" sub={withFitters.length ? `${withFitters.length} frame${withFitters.length > 1 ? 's' : ''} being repaired` : 'No repair jobs out'}>
            {withFitters.length ? (
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {withFitters.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-sunken">
                      <span className="t-body-strong">{t.frameId}</span>
                      <span className="t-small min-w-0 flex-1 truncate text-muted">{userName(s, t.fitterId)}</span>
                      <span className={cx('t-small-strong', t.repairDoneAt ? 'text-ok' : 'text-major')}>{t.repairDoneAt ? 'Repair done' : 'Repairing'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small text-muted">Frames you send to a fitter appear here until the repair is done.</p>
            )}
          </Panel>
          <Panel className="flex-1" title="For the next shift" sub={live.length ? `${live.length} ticket${live.length > 1 ? 's' : ''} still open` : 'Nothing to hand over'}>
            {notes.length ? (
              <ul className="flex flex-col gap-2">
                {notes.map((t) => (
                  <li key={t.id} className="t-small rounded-[8px] bg-sunken px-3 py-2">
                    <span className="t-small-strong">{t.frameId}</span> · {t.handover}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small text-muted">{live.length ? 'No hand-over notes yet. Add one from the ticket on your phone.' : 'Everything is closed. A clean hand-over.'}</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="anim-in" style={{ '--i': 5 } as CSSProperties}>
        <Panel
          title="Ring frames, floor order"
          sub={`${states.running} of ${s.frames.length} running normally`}
          aside={
            <Link to="/dashboard/machines" className="t-small-strong flex items-center gap-1 text-brand hover:underline">
              Machines <ArrowRight size={14} />
            </Link>
          }
        >
          <FloorMap s={s} now={now} onOpen={(id) => nav(`/dashboard/machines/${id}`)} />
        </Panel>
      </div>
    </div>
  );
}

// ---------- QC manager: decisions waiting ----------
function WaitingForYou({ s, now }: { s: MillState; now: number }) {
  const nav = useNavigate();
  const holds = s.holds.filter((h) => h.status === 'on_hold' && !holdNeedsApproval(h));
  const tests = pendingRequests(s);
  const n = holds.length + tests.length;
  return (
    <Panel title="Waiting for you" sub={n ? `${n} thing${n > 1 ? 's' : ''} need the QC manager` : 'Nothing waiting'} className="anim-in">
      {n ? (
        <ul className="grid gap-x-4 gap-y-1 md:grid-cols-2">
          {holds.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => nav('/dashboard/held')} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken text-left hover:bg-sunken">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-held-soft text-held">
                  <Locked size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-small-strong block">Decide on held yarn · {h.frameId}</span>
                  <span className="t-small block truncate text-muted">
                    Lot {h.lotId} · {roundKg(holdKg(h, now))} kg · waiting {ago(now - h.from)}
                  </span>
                </span>
                <ArrowRight size={16} className="text-muted" />
              </button>
            </li>
          ))}
          {tests.map((r) => (
            <li key={r.id}>
              <div className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken">
                <span className={cx('grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold', r.urgent ? 'bg-major-soft text-major' : 'bg-sunken text-muted')}>Lab</span>
                <span className="min-w-0 flex-1">
                  <span className="t-small-strong block">
                    {r.urgent ? 'Urgent ' : ''}lab test · {r.frameId}
                  </span>
                  <span className="t-small block text-muted">{now > r.dueAt ? `Late by ${ago(now - r.dueAt)}` : `Due ${hhmm(r.dueAt)}`} · enter it from the phone</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small text-muted">Held yarn decisions and lab tests that are waiting appear here.</p>
      )}
    </Panel>
  );
}

// ---------- plant head: the big picture ----------
function PlantOverview() {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const nowMin = Math.floor(now / 60000);
  const a = useMemo(() => {
    const since30 = mill(millDayKey(now)) - 29 * DAY;
    const month = ticketsSince(s, since30, now);
    const serious = month.filter((t) => t.severity !== 'minor');
    const byFrame = new Map<string, number>();
    for (const t of serious) byFrame.set(t.frameId, (byFrame.get(t.frameId) ?? 0) + 1);
    return {
      daily: dailyAlerts(s, now, 60),
      saved: yarnSaved(s, now, since30),
      frames: [...byFrame.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([name, value]) => ({ name, value })),
      month,
    };
    // recompute once a mill minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, nowMin]);
  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed');
  const toMe = live.filter((t) => escalation(t, now).level >= 2);
  const waiting = s.holds.filter((h) => h.status === 'on_hold' && holdNeedsApproval(h));
  const sum = (d: { critical: number; major: number }[]) => d.reduce((n, x) => n + x.critical + x.major, 0);
  const alerts = sum(a.daily.slice(-30));
  const before = sum(a.daily.slice(0, 30));
  const states = frameStateCounts(s, now);
  const calmDays = a.daily.slice(-30).filter((d) => d.critical === 0).length;
  const doneCount = a.month.filter((t) => t.status === 'closed' || t.status === 'fixed').length;
  const weekday = WEEKDAYS[new Date(now + 5.5 * 3600000).getUTCDay()];
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="anim-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-page">Plant overview</h1>
          <p className="t-small mt-0.5 text-muted">
            {weekday} {dayMonth(now)} · last 30 days
          </p>
        </div>
        <Link to="/dashboard/report" className="t-small-strong flex items-center gap-1 text-brand hover:underline">
          Full monthly report <ArrowRight size={14} />
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Waiting for your approval" sub={waiting.length ? `${waiting.length} big decision${waiting.length > 1 ? 's' : ''}` : 'Nothing waiting'} className="anim-in">
          {waiting.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {waiting.map((h) => (
                <li key={h.id}>
                  <Link to="/dashboard/held" className="flex items-center gap-4 py-2.5 hover:bg-sunken">
                    <span className="t-body-strong">{h.frameId}</span>
                    <span className="t-small flex-1 text-muted">
                      Lot {h.lotId} · {roundKg(holdKg(h, now))} kg held
                    </span>
                    <span className="t-small-strong text-brand">Review</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-small text-muted">Releases after a failed re-test and other overrides appear here.</p>
          )}
        </Panel>
        <Panel title="Escalated to you" sub={toMe.length ? `${toMe.length} still open after 20 min` : 'Nothing escalated'} className="anim-in">
          {toMe.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {toMe.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-sunken">
                    <SeverityBadge level={t.severity} />
                    <span className="t-body-strong">{t.frameId}</span>
                    <span className="t-small min-w-0 flex-1 truncate text-muted">{t.title}</span>
                    <span className="t-data text-[12px] text-critical">{ago(now - t.alertAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-small text-muted">Tickets nobody has handled for 20 minutes come straight to you.</p>
          )}
        </Panel>
      </div>

      <section className="grid gap-5 md:grid-cols-3" aria-label="Key numbers">
        <Goal i={1} label="Yarn saved" value={<CountUp value={a.saved.saved} format={(v) => Math.round(v).toLocaleString('en-IN')} />} unit="kg" goal="30 days" badge={{ text: 'Estimate', tone: 'good' }} note={`${a.saved.incidents} holds against about ${BASELINE_KG} kg per incident before`} />
        <Goal i={2} label="Alerts this month" value={<CountUp value={alerts} />} goal={`${before} before`} badge={alerts <= before ? { text: 'Fewer', tone: 'good' } : { text: `${alerts - before} more`, tone: 'bad' }} note="Critical and major, against the 30 days before" />
        <Goal i={3} label="Held per incident" value={<CountUp value={a.saved.avgHeld} />} unit="kg" goal={`${BASELINE_KG} kg`} badge={{ text: `${Math.max(0, Math.round(100 - (a.saved.avgHeld / BASELINE_KG) * 100))}% less`, tone: 'good' }} note="Yarn held per incident against the old amount" />
      </section>

      <div className="anim-in grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" style={{ '--i': 4 } as CSSProperties}>
        <Panel title="Alerts per day" sub="Last 30 days, by severity" aside={<SeverityLegend />}>
          <StackedColumns data={a.daily.slice(-30)} dayLabel={dayMonth} label="Alerts per day for the last 30 days, by severity" />
        </Panel>
        <section className="divide-y divide-[var(--line)] rounded-[12px] border border-line bg-raised" aria-label="Health">
          <GaugeRow i={0} label="Frames running" value={`${states.running}`} goal={`${s.frames.length}`} pct={Math.round((states.running / s.frames.length) * 100)} />
          <GaugeRow i={1} label="Calm days, 30 days" value={`${calmDays}`} goal="30" pct={Math.round((calmDays / 30) * 100)} />
          <GaugeRow i={2} label="Tickets resolved" value={`${doneCount}`} goal={`${a.month.length}`} pct={a.month.length ? Math.round((doneCount / a.month.length) * 100) : 100} />
        </section>
      </div>

      <div className="anim-in" style={{ '--i': 5 } as CSSProperties}>
        <Panel title="Frames with most alerts" sub="Critical and major, last 30 days">
          {a.frames.length ? <BarList items={a.frames} format={(v) => `${v}`} /> : <p className="t-small text-muted">No alerts this month.</p>}
        </Panel>
      </div>
    </div>
  );
}

// ---------- the black attention panel, shared ----------
function AttentionPanel({ s, now, tickets, title, recent = [] }: { s: MillState; now: number; tickets: Ticket[]; title: string; recent?: Ticket[] }) {
  const nav = useNavigate();
  const theme = useTheme('dash');
  return (
    <section data-theme={theme === 'day' ? 'night' : undefined} className="flex flex-col rounded-[12px] border-t-2 border-t-[var(--brand)] p-5 text-ink ring-1 ring-[var(--line)]" style={{ background: 'var(--focus-surface)' }}>
      <header className="flex items-center justify-between">
        <h2 className="t-label text-muted">{title}</h2>
        <Link to="/dashboard/tickets" className="t-small-strong flex items-center gap-1 text-brand hover:underline">
          All tickets <ArrowRight size={14} />
        </Link>
      </header>
      {tickets.length ? (
        <ul className="mt-3 flex flex-col divide-y divide-[var(--line)]">
          {tickets.slice(0, 5).map((t, n) => {
            const mins = (now - t.alertAt) / 60000;
            const pct = Math.min(100, Math.round((mins / t.escalateQcMins) * 100));
            return (
              <li key={t.id}>
                <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="block w-full py-3 text-left hover:opacity-90">
                  <div className="flex items-center gap-3">
                    <span className="t-body-strong">{t.frameId}</span>
                    <span className="t-small min-w-0 flex-1 truncate text-muted">{t.title}</span>
                    <SeverityBadge level={t.severity} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${Math.round(mins)} of ${t.escalateQcMins} minutes before escalation`}>
                      <div className={cx('anim-grow-x h-full rounded-full', pct >= 100 ? 'bg-critical' : 'bg-brand')} style={{ width: `${pct}%`, '--i': n } as CSSProperties} />
                    </div>
                    <span className="t-data whitespace-nowrap text-[12px] text-muted">
                      {mins > t.escalateQcMins ? `open ${ago(now - t.alertAt)}` : `${Math.round(mins)} / ${t.escalateQcMins} min`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-body mt-6 pb-4 text-muted">Nothing needs attention. {s.frames.length} frames are covered.</p>
      )}
      {recent.length > 0 && (
        <div className="mt-auto pt-5">
          <h3 className="t-label border-t border-line pt-4 text-muted">Recently resolved</h3>
          <ul className="mt-2 flex flex-col">
            {recent.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="flex w-full items-center gap-3 py-2 text-left hover:opacity-90">
                  <span className="t-data">{t.frameId}</span>
                  <span className="t-small min-w-0 flex-1 truncate text-muted">{t.title}</span>
                  <span className="t-data text-[12px] text-muted">
                    {dayMonth(t.closedAt ?? t.createdAt)}, {hhmm(t.closedAt ?? t.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
