import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from '@carbon/icons-react';
import type { MillState, Ticket } from '../engine/types';
import { useMillState, useNow, useUser } from '../store/store';
import { bySeverityThenAge, escalation, frameView, holdNeedsApproval, type FrameStateKind } from '../engine/selectors';
import { frameWord, holdKg, roundKg, userName } from '../engine/reducer';
import { insights } from '../engine/insights';
import { BASELINE_KG, alertHeat, dailyAlerts, frameStateCounts, seenTrend, shiftResponse, ticketsSince, topCauses, yarnSaved } from '../engine/analytics';
import { DAY, dayMonth, hhmm, mill, millDayKey, shiftAt, timer } from '../engine/time';
import { cx, Empty, SeverityBadge, StatusChip } from '../ui/primitives';
import { InsightCard, readingLine, ticketChip } from '../ui/cards';
import { BarList, Ring, SeverityLegend, ShiftBars, StackedColumns, TrendArea } from '../ui/charts';
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

export function Overview() {
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
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(now + 5.5 * 3600000).getUTCDay()];

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
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

      <section className="grid gap-4 md:grid-cols-3" aria-label="Key numbers">
        <Goal
          label="Time to Seen"
          value={seenNow !== null ? timer(seenNow * 60000) : '–'}
          goal="5:00"
          badge={seenNow === null ? undefined : seenNow <= 5 ? { text: 'On target', tone: 'good' } : { text: 'Over limit', tone: 'bad' }}
          note="Median minutes from alert to Seen, last 7 days"
        />
        <Goal
          label="Seen in time"
          value={`${inTimePct}%`}
          goal="90%"
          badge={inTimePct >= 90 ? { text: 'On target', tone: 'good' } : { text: `${90 - inTimePct}% short`, tone: 'bad' }}
          note={`${inTime} of ${serious.length} critical and major alerts, last 30 days`}
        />
        <Goal
          label="Yarn held per incident"
          value={`${Math.round(saved.avgHeld)}`}
          unit="kg"
          goal={`${BASELINE_KG} kg`}
          badge={{ text: `${lessLost}% less`, tone: 'good' }}
          note={`${roundKg(saved.saved).toLocaleString('en-IN')} kg saved in 30 days, estimate`}
        />
      </section>

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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section data-theme="night" className="rounded-[12px] bg-surface p-5 text-ink">
          <header className="flex items-center justify-between">
            <h2 className="t-label text-muted">Needs attention</h2>
            <Link to="/dashboard/tickets" className="t-small-strong flex items-center gap-1 text-brand hover:underline">
              All tickets <ArrowRight size={14} />
            </Link>
          </header>
          {live.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-[var(--line)]">
              {live.slice(0, 4).map((t) => {
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
                          <div className={cx('h-full rounded-full', pct >= 100 ? 'bg-critical' : 'bg-brand')} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="t-data whitespace-nowrap text-[12px] text-muted">
                          {Math.round(mins)} / {t.escalateQcMins} min
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
        </section>

        <section className="divide-y divide-[var(--line)] rounded-[12px] border border-line bg-raised" aria-label="Health">
          <GaugeRow label="Frames running" value={`${states.running}`} goal={`${s.frames.length}`} pct={Math.round((states.running / s.frames.length) * 100)} />
          <GaugeRow label="Calm days, 30 days" value={`${calmDays}`} goal="30" pct={Math.round((calmDays / 30) * 100)} />
          <GaugeRow label="Holds decided" value={`${s.holds.filter((h) => h.status !== 'on_hold').length}`} goal={`${s.holds.length}`} pct={s.holds.length ? Math.round((s.holds.filter((h) => h.status !== 'on_hold').length / s.holds.length) * 100) : 100} />
          <GaugeRow label="Tickets resolved" value={`${doneCount}`} goal={`${a.month.length}`} pct={resolvedPct} />
        </section>
      </div>

      <div className={cx('grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]', isPlant && 'hidden')}>
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
        </Panel>
        <CalendarPanel s={s} now={now} onOpen={(id) => nav(`/dashboard/tickets/${id}`)} />
      </div>
    </div>
  );
}

function Goal({ label, value, unit, goal, badge, note }: { label: string; value: string; unit?: string; goal: string; badge?: { text: string; tone: 'good' | 'bad' }; note: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-raised p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="t-label text-muted">{label}</p>
        {badge && <span className={cx('t-label rounded-[4px] px-1.5 text-[10px]', badge.tone === 'good' ? 'bg-ok text-surface' : 'bg-critical text-on-critical')}>{badge.text}</span>}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="t-stat !text-[34px] !leading-[38px]">{value}</span>
        {unit && <span className="t-body text-muted">{unit}</span>}
        <span className="t-stat !text-[22px] !leading-[28px] !font-normal text-neutral">/ {goal}</span>
      </p>
      <p className="t-small mt-2 text-muted">{note}</p>
    </div>
  );
}

function GaugeRow({ label, value, goal, pct, invert }: { label: string; value: string; goal: string; pct: number; invert?: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  const tone = invert ? 'var(--ink)' : p >= 80 ? 'var(--ok)' : p >= 40 ? 'var(--ink)' : 'var(--critical)';
  const len = Math.PI * 28;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="t-label text-[10px] text-muted">{label}</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="t-stat !text-[24px] !leading-[28px]">{value}</span>
          <span className="t-body text-neutral">/ {goal}</span>
        </p>
      </div>
      <div className="relative h-[38px] w-[64px] shrink-0" role="img" aria-label={`${label}: ${p}%`}>
        <svg viewBox="0 0 64 36" className="h-full w-full">
          <path d="M4 32 A28 28 0 0 1 60 32" fill="none" stroke="var(--grid)" strokeWidth="5" strokeLinecap="round" />
          <path d="M4 32 A28 28 0 0 1 60 32" fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(len * p) / 100} ${len}`} />
        </svg>
        <span className="t-data absolute inset-x-0 bottom-0 text-center text-[11px] leading-none">{p}%</span>
      </div>
    </div>
  );
}

const TILE: Record<FrameStateKind, string> = {
  running: 'bg-sunken text-ink border-transparent',
  warning: 'bg-major-soft text-major border-major-fill',
  fault: 'bg-critical text-on-critical border-critical pulse-critical',
  held: 'bg-held-soft text-held border-held',
  stopped: 'bg-transparent text-muted border-dashed border-line-strong',
};
const SHORT: Record<FrameStateKind, string> = { running: 'Run', warning: 'Warn', fault: 'Fail', held: 'Hold', stopped: 'Stop' };

function FloorMap({ s, now, onOpen }: { s: MillState; now: number; onOpen: (id: string) => void }) {
  const rows = [s.frames.slice(0, 8), s.frames.slice(8, 16), s.frames.slice(16, 24)];
  const [hover, setHover] = useState<string | null>(null);
  const hv = hover ? frameView(s, hover, now) : undefined;
  const hf = hover ? s.frames.find((f) => f.id === hover) : undefined;
  const product = hf ? s.products.find((p) => p.id === s.lots.find((l) => l.id === hf.lotId)!.productId) : undefined;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, r) => (
        <div key={r} className="grid grid-cols-[56px_repeat(8,minmax(0,1fr))] items-center gap-2">
          <span className="t-small text-muted">Row {r + 1}</span>
          {row.map((f) => {
            const v = frameView(s, f.id, now);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onOpen(f.id)}
                onMouseEnter={() => setHover(f.id)}
                onFocus={() => setHover(f.id)}
                onMouseLeave={() => setHover(null)}
                aria-label={`${f.id}: ${v.label}. ${v.line}`}
                className={cx('flex h-14 min-w-0 flex-col items-center justify-center overflow-hidden whitespace-nowrap rounded-[10px] border-2 transition-transform hover:-translate-y-0.5', TILE[v.kind])}
              >
                <span className="font-mono text-[15px] font-semibold leading-5 tabular-nums">{f.num}</span>
                <span className="text-[11px] leading-4 opacity-80">{v.kind === 'running' ? f.lotId : SHORT[v.kind]}</span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="t-small mt-1 h-5 text-muted" aria-live="polite">
        {hf && hv ? (
          <>
            <span className="font-semibold text-ink">{hf.id}</span> · {product?.name} · Lot {hf.lotId} · {hv.label} · {hv.line}
          </>
        ) : (
          'Point at a frame for details. Numbers show the lot each frame is spinning.'
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
    return { daily: dailyAlerts(s, now, 30), trend: seenTrend(s, now, 30), causes: topCauses(month).slice(0, 6), shifts: shiftResponse(month) };
    // recompute once a mill minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, nowMin]);
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <PageHead title="Monthly report" sub="Last 30 days" />
      <AlertHeat grid={alertHeat(s, now, 30)} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Alerts per day" sub="Last 30 days, by severity" aside={<SeverityLegend />}>
          <StackedColumns data={a.daily} dayLabel={dayMonth} label="Alerts per day for the last 30 days, by severity" />
        </Panel>
        <Panel title="Top causes" sub="What fixed frames had in common, last 30 days">
          {a.causes.length ? <BarList items={a.causes} /> : <p className="t-small text-muted">No fixed tickets yet.</p>}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
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
        <Panel title="By shift" sub="Median minutes to Seen, last 30 days">
          <div className="pt-6">
            <ShiftBars rows={a.shifts} limit={5} label="Median minutes to Seen for shifts A, B and C" />
          </div>
          <p className="t-small mt-4 text-muted">A 00–08 · B 08–16 · C 16–24</p>
        </Panel>
      </div>
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
  return (
    <Panel title="When alerts happen" sub="Critical and major, last 30 days, by weekday and hour">
      <div role="img" aria-label="Heat map of critical and major alerts by weekday and 3-hour block" className="grid grid-cols-[32px_repeat(8,minmax(0,1fr))] items-center gap-1.5">
        {grid.map((row, r) => (
          <div key={DAYS7[r]} className="contents">
            <span className="t-small text-muted">{DAYS7[r]}</span>
            {row.map((v, c) => (
              <span
                key={c}
                title={`${DAYS7[r]} ${HOURS[c]}:00, ${v} alert${v === 1 ? '' : 's'}`}
                className="h-6 rounded-[6px]"
                style={{ background: v ? `color-mix(in srgb, var(--brand) ${Math.round(18 + (v / max) * 82)}%, var(--surface-raised))` : 'var(--surface-sunken)' }}
              />
            ))}
          </div>
        ))}
        <span />
        {HOURS.map((h) => (
          <span key={h} className="t-data text-center text-[11px] text-muted">
            {h}
          </span>
        ))}
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
      <div className="grid grid-cols-7 gap-y-1 text-center">
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
          const crit = list.some((t) => t.severity === 'critical');
          const future = k > todayKey;
          const isPicked = k === picked;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setPicked(k)}
              aria-pressed={isPicked}
              aria-label={`${d} ${MONTH_NAMES[view.m]}, ${list.length} alert${list.length === 1 ? '' : 's'}`}
              className={cx(
                't-small mx-auto flex size-9 flex-col items-center justify-center rounded-[8px]',
                isPicked ? 'bg-brand font-semibold text-on-brand' : k === todayKey ? 'font-semibold text-brand ring-1 ring-[var(--brand)]' : future ? 'text-[var(--line-strong)]' : 'hover:bg-sunken',
              )}
            >
              {d}
              <span className={cx('mt-px size-1 rounded-full', list.length ? (isPicked ? 'bg-on-brand' : crit ? 'bg-critical' : 'bg-major-fill') : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
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
