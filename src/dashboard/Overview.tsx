import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Checkmark } from '@carbon/icons-react';
import type { MillState, Ticket } from '../engine/types';
import { useMillState, useNow, useUser } from '../store/store';
import { bySeverityThenAge, escalation, frameView, heldKg, openHolds, type FrameStateKind } from '../engine/selectors';
import { frameWord, holdKg, roundKg, userName } from '../engine/reducer';
import { insights } from '../engine/insights';
import { BASELINE_KG, dailyAlerts, frameStateCounts, seenTrend, shiftResponse, ticketsSince, topCauses, yarnSaved } from '../engine/analytics';
import { DAY, dayMonth, hhmm, mill, millDayKey, millHour, shiftAt, timer } from '../engine/time';
import { cx, Empty, SeverityBadge, SeverityShape, StatusChip } from '../ui/primitives';
import { InsightCard, readingLine, ticketChip } from '../ui/cards';
import { BarList, CategoryBar, Ring, SeverityLegend, ShiftBars, Sparkline, StackedColumns, TrendArea } from '../ui/charts';

export function Panel({ title, sub, aside, children, className }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex min-w-0 flex-col rounded-[8px] border border-line bg-raised p-5 shadow-raised', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-body-strong">{title}</h2>
          {sub && <p className="t-small mt-0.5 text-muted">{sub}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Overview() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const nav = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed').sort(bySeverityThenAge);
  const incidents = live.filter((t) => t.severity !== 'minor');
  const nowMin = Math.floor(now / 60000);
  const a = useMemo(() => {
    const since30 = mill(millDayKey(now)) - 29 * DAY;
    const month = ticketsSince(s, since30, now);
    return {
      daily: dailyAlerts(s, now, 30),
      trend: seenTrend(s, now, 30),
      causes: topCauses(month).slice(0, 6),
      shifts: shiftResponse(month),
      saved: yarnSaved(s, now, since30),
      month,
    };
    // recompute once a mill minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, nowMin]);
  const states = frameStateCounts(s, now);
  const holds = openHolds(s);
  const kg = roundKg(heldKg(s, now));
  const alerts30 = a.daily.reduce((n, d) => n + d.critical + d.major, 0);
  const escalated30 = a.month.filter((t) => t.severity !== 'minor' && escalation(t, now).level > 0).length;
  const seenNow = [...a.trend].reverse().find((p) => p.mins !== null)?.mins ?? null;
  const insight = insights(s, now).filter((i) => !dismissed.includes(i.id))[0];
  const h = millHour(now);
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const weekday = WEEKDAY[new Date(now + 5.5 * 3600000).getUTCDay()];
  const crit = incidents.filter((t) => t.severity === 'critical').length;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-small text-muted">
            {weekday} {dayMonth(now)} · {shiftAt(now)} shift · {hhmm(now)}
          </p>
          <h1 className="t-page mt-1">
            {greet}, {user.name.split(' ')[0]}
          </h1>
        </div>
        <FloorStatus incidents={incidents.length} critical={crit} />
      </header>

      {incidents.length > 0 && (
        <section aria-label="Live alerts" className="flex flex-col gap-3">
          {incidents.map((t) => (
            <IncidentCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/dashboard/tickets/${t.id}`)} />
          ))}
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        <Kpi
          label="Time to Seen"
          value={seenNow !== null ? timer(seenNow * 60000) : '–'}
          note={seenNow !== null ? (seenNow <= 5 ? 'Median, last 7 days · inside the 5 min limit' : 'Median, last 7 days · over the 5 min limit') : 'No alerts yet'}
          tone={seenNow !== null && seenNow > 5 ? 'bad' : 'good'}
          chart={<Sparkline values={a.trend.map((p) => p.mins)} label="Median minutes to Seen, last 30 days" />}
        />
        <Kpi
          label="Yarn on hold"
          value={kg}
          unit="kg"
          note={holds.length ? `${holds.length} lot${holds.length > 1 ? 's' : ''} waiting for a decision` : 'Nothing waiting'}
          tone={holds.length ? 'held' : 'neutral'}
          to="/dashboard/held"
          chart={<HoldStrip holds={holds.map((h) => ({ id: h.id, frame: h.frameId, kg: holdKg(h, now) }))} />}
        />
        <Kpi
          label="Alerts, last 30 days"
          value={alerts30}
          note={`${escalated30} escalated · minor faults not counted`}
          tone="neutral"
          chart={<Sparkline values={a.daily.map((d) => d.critical + d.major)} color="var(--neutral-state)" label="Critical and major alerts per day" />}
        />
        <Kpi
          label="Yarn saved, last 30 days"
          value={roundKg(a.saved.saved).toLocaleString('en-IN')}
          unit="kg"
          note={`Estimate: ${a.saved.incidents} holds averaged ${Math.round(a.saved.avgHeld)} kg, against about ${BASELINE_KG} kg per incident before`}
          tone="good"
          chart={
            <div className="flex items-center gap-3">
              <Ring value={a.saved.avgHeld} max={BASELINE_KG} size={44} label={`Average held ${Math.round(a.saved.avgHeld)} of ${BASELINE_KG} kg`} />
              <span className="t-small text-muted">{Math.round((a.saved.avgHeld / BASELINE_KG) * 100)}% of the old loss per incident</span>
            </div>
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Ring frames, floor order"
          sub={`${states.running} of ${s.frames.length} running normally${states.stopped ? `, ${states.stopped} stopped for doffing` : ''}`}
          aside={<Link to="/dashboard/machines" className="t-small-strong flex items-center gap-1 text-brand hover:underline">Machines <ArrowRight size={14} /></Link>}
        >
          <FloorMap s={s} now={now} onOpen={(id) => nav(`/dashboard/machines/${id}`)} />
          <div className="mt-5">
            <CategoryBar
              label="Frames by state"
              parts={[
                { key: 'running', value: states.running, color: 'var(--neutral-state)', word: 'Running' },
                { key: 'warning', value: states.warning, color: 'var(--major-fill)', word: 'Warning' },
                { key: 'fault', value: states.fault, color: 'var(--critical)', word: 'Failed' },
                { key: 'held', value: states.held, color: 'var(--held)', word: 'Yarn on hold' },
                { key: 'stopped', value: states.stopped, color: 'var(--line-strong)', word: 'Stopped' },
              ]}
            />
          </div>
        </Panel>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="t-body-strong">AI insight</h2>
            <Link to="/dashboard/insights" className="t-small-strong text-brand hover:underline">
              All insights
            </Link>
          </div>
          {insight ? (
            <InsightCard insight={{ ...insight, onAction: () => nav(insight.target) }} onDismiss={() => setDismissed((d) => [...d, insight.id])} />
          ) : (
            <Empty title="No new insights" body="Insights appear when the data shows a pattern worth a look." />
          )}
        </div>
      </div>

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

      {live.length > 0 && (
        <Panel title="Open tickets" sub={`${live.length} not closed yet`} aside={<Link to="/dashboard/tickets" className="t-small-strong flex items-center gap-1 text-brand hover:underline">All tickets <ArrowRight size={14} /></Link>}>
          <ul className="divide-y divide-[var(--line)]">
            {live.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="grid w-full grid-cols-[110px_80px_1fr_auto_80px] items-center gap-3 py-2.5 text-left hover:bg-sunken">
                  <SeverityBadge level={t.severity} />
                  <span className="t-data">{t.frameId}</span>
                  <span className="t-small min-w-0 truncate">
                    {t.title} · <span className="t-data text-[13px]">{readingLine(s, t)}</span>
                  </span>
                  <StatusChip kind={ticketChip(t, now)} />
                  <span className="t-data text-right text-[13px] text-muted">{hhmm(t.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function FloorStatus({ incidents, critical }: { incidents: number; critical: number }) {
  if (!incidents)
    return (
      <p className="t-small-strong flex items-center gap-2 rounded-full border border-line bg-raised px-4 py-2 shadow-raised">
        <span className="grid size-5 place-items-center rounded-full bg-ok-soft text-ok">
          <Checkmark size={14} />
        </span>
        Floor is calm. No live alerts.
      </p>
    );
  return (
    <p className={cx('t-small-strong flex items-center gap-2 rounded-full px-4 py-2', critical ? 'bg-critical text-on-critical' : 'bg-major-soft text-major')}>
      <SeverityShape level={critical ? 'critical' : 'major'} className={critical ? '[&_path]:fill-[var(--on-critical)]' : ''} />
      {incidents} live alert{incidents > 1 ? 's' : ''} need{incidents > 1 ? '' : 's'} someone on the floor
    </p>
  );
}

function Kpi({
  label,
  value,
  unit,
  note,
  tone,
  chart,
  to,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note: string;
  tone: 'good' | 'bad' | 'neutral' | 'held';
  chart: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <p className="t-small text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cx('t-stat', tone === 'held' ? 'text-held' : tone === 'bad' ? 'text-critical' : 'text-ink')}>{value}</span>
        {unit && <span className="t-small text-muted">{unit}</span>}
      </p>
      <div className="mt-3">{chart}</div>
      <p className={cx('t-small mt-3', tone === 'good' ? 'text-ok' : tone === 'bad' ? 'text-critical' : 'text-muted')}>{note}</p>
    </>
  );
  const cls = 'flex min-w-0 flex-col rounded-[8px] border border-line bg-raised p-5 shadow-raised';
  return to ? (
    <Link to={to} className={cx(cls, 'transition-colors hover:border-line-strong')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function HoldStrip({ holds }: { holds: { id: string; frame: string; kg: number }[] }) {
  const total = holds.reduce((a, h) => a + h.kg, 0);
  if (!total) return <div className="h-9 rounded-[4px] border border-dashed border-line" aria-hidden />;
  return (
    <div className="flex h-9 flex-col justify-center gap-1.5">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={holds.map((h) => `${h.frame} ${Math.round(h.kg)} kg`).join(', ')}>
        {holds.map((h, i) => (
          <div key={h.id} className="h-full" style={{ width: `${(h.kg / total) * 100}%`, background: 'var(--held)', opacity: 1 - i * 0.22 }} title={`${h.frame}: ${Math.round(h.kg)} kg`} />
        ))}
      </div>
      <p className="t-data truncate text-[12px] text-muted">{holds.map((h) => `${h.frame} ${roundKg(h.kg)}`).join(' · ')}</p>
    </div>
  );
}

// ---------- the floor, drawn as the mill floor ----------
const TILE: Record<FrameStateKind, string> = {
  running: 'bg-sunken text-ink border-transparent',
  warning: 'bg-major-soft text-major border-major-fill',
  fault: 'bg-critical text-on-critical border-critical pulse-critical',
  held: 'bg-held-soft text-held border-held',
  stopped: 'bg-transparent text-muted border-dashed border-line-strong',
};
const WORD: Record<FrameStateKind, string> = { running: 'Running', warning: 'Warning', fault: 'Failed', held: 'Yarn on hold', stopped: 'Stopped' };

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
                className={cx('flex h-14 flex-col items-center justify-center rounded-[6px] border-2 transition-transform hover:-translate-y-0.5', TILE[v.kind])}
              >
                <span className="font-mono text-[15px] font-semibold leading-5 tabular-nums">{f.num}</span>
                <span className="text-[11px] leading-4 opacity-80">{v.kind === 'running' ? f.lotId : WORD[v.kind]}</span>
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
        'anim-rise grid w-full items-center gap-6 rounded-[8px] border p-5 text-left shadow-raised md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto]',
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
