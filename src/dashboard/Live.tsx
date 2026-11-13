// Live alerts: the dashboard is the record and the go-between. It shows every alert,
// who it was sent to, who answered, how long the fix took and what the fix report said.
// Nothing is decided here: people act on their phones.
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Checkmark } from '@carbon/icons-react';
import type { MillState, Ticket, User } from '../engine/types';
import { useMillState, useNow, useUser } from '../store/store';
import { bySeverityThenAge, escalation, median, messagesFor, waitingOn, type Message } from '../engine/selectors';
import { covers, failWord, frameWord, ruleFor, withUnit } from '../engine/reducer';
import { topCauses, yarnSaved } from '../engine/analytics';
import { DAY, HOUR, ago, dayMonth, hhmm, mill, millDayKey, millHour, shiftAt, timer } from '../engine/time';
import { BarList } from '../ui/charts';
import { cx, SeverityBadge, SeverityShape } from '../ui/primitives';
import { Panel } from './Overview';
import { PlantHome } from './plant';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Overview() {
  const user = useUser('dash');
  // The plant head gets his decision desk (dashboard/plant.tsx).
  if (user.role === 'plant') return <PlantHome />;
  return <LiveAlerts />;
}

function LiveAlerts() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const nav = useNavigate();
  const mine = (t: Ticket) => user.role !== 'supervisor' || covers(user, t.frameId) || t.seenBy === user.id;
  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed' && t.severity !== 'minor' && mine(t)).sort(bySeverityThenAge);
  const retest = s.tickets.filter((t) => t.status === 'fixed' && mine(t));
  const h = millHour(now);
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const weekday = WEEKDAY[new Date(now + 5.5 * HOUR).getUTCDay()];
  const recent = useMemo(
    () =>
      s.tickets
        .filter((t) => now - t.createdAt < DAY && mine(t))
        .flatMap((t) => messagesFor(s, t, now).map((m) => ({ ...m, t })))
        .filter((m) => m.at <= now)
        .sort((a, b) => b.at - a.at)
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, Math.floor(now / 30000)],
  );

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-small text-muted">
            {weekday} {dayMonth(now)} · {shiftAt(now)} shift · {hhmm(now)}
          </p>
          <h1 className="t-page mt-1">
            {greet}, {user.name.split(' ')[0]}
          </h1>
          <p className="t-small mt-1 text-muted">Every alert, who it went to and who answered. People act on their phones; this is the record.</p>
        </div>
        <StatusPill n={live.length} critical={live.some((t) => t.severity === 'critical')} />
      </header>

      <Panel title="Live alerts" sub={live.length ? `${live.length} not fixed yet` : 'Nothing open'}>
        {live.length ? (
          <div className="flex flex-col gap-3">
            {live.map((t) => (
              <AlertRow key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/dashboard/tickets/${t.id}`)} />
            ))}
          </div>
        ) : (
          <Calm text={user.role === 'supervisor' ? 'No failed tests on your frames. A new one rings your phone first.' : 'No failed test is waiting for anyone.'} />
        )}
      </Panel>

      <div className={cx('grid gap-6', retest.length > 0 && 'lg:grid-cols-2')}>
        {retest.length > 0 && (
          <Panel title="Fixed, waiting for the lab re-test" sub="A pass closes it; a fail sends it back to the line">
            <ul className="divide-y divide-[var(--line)]">
              {retest.map((t) => {
                const r = s.requests.find((q) => q.ticketId === t.id && q.reason === 'retest' && q.status === 'pending');
                return (
                  <li key={t.id}>
                    <Link to={`/dashboard/tickets/${t.id}`} className="grid grid-cols-[14px_56px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 hover:bg-sunken">
                      <SeverityShape level={t.severity} />
                      <span className="t-small-strong">{t.frameId}</span>
                      <span className="t-small min-w-0 truncate">
                        {t.part ?? 'Fixed'} · {t.cause?.toLowerCase()}
                      </span>
                      <span className="t-data text-[12px] text-muted">{r ? `due ${hhmm(r.dueAt)}` : 'asked'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
        <Panel
          title="Latest messages"
          sub="What QC Alert sent, and who answered, last 24 hours"
          aside={
            <Link to="/dashboard/messages" className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
              All messages <ArrowRight size={14} />
            </Link>
          }
        >
          {recent.length ? <MessageList items={recent} showFrame /> : <Calm text="No messages in the last 24 hours." />}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Overall s={s} now={now} />
        <Recent s={s} user={user} />
      </div>
    </div>
  );
}

function StatusPill({ n, critical }: { n: number; critical: boolean }) {
  if (!n)
    return (
      <p className="t-small-strong flex items-center gap-2 rounded-full border border-line bg-raised px-4 py-2">
        <span className="grid size-5 place-items-center rounded-full bg-ok-soft text-ok">
          <Checkmark size={14} />
        </span>
        No live alerts
      </p>
    );
  return <p className={cx('t-small-strong rounded-full px-4 py-2', critical ? 'bg-critical text-on-critical' : 'bg-major-soft text-major')}>{n} live alert{n > 1 ? 's' : ''}</p>;
}

function Calm({ text }: { text: string }) {
  return (
    <p className="t-small flex items-center gap-2 rounded-[10px] bg-sunken px-4 py-3 text-muted">
      <Checkmark size={16} className="text-ok" /> {text}
    </p>
  );
}

/** Messages, newest first: who, how, what, and whether it went out or came back. */
export function MessageList({ items, showFrame }: { items: (Message & { t?: Ticket })[]; showFrame?: boolean }) {
  return (
    <ol className="flex flex-col">
      {items.map((m, i) => (
        <li key={i} className="grid grid-cols-[44px_20px_minmax(0,1fr)] gap-x-2 border-b border-line py-2 last:border-b-0">
          <span className="t-data pt-0.5 text-[12px] text-muted">{hhmm(m.at)}</span>
          <span aria-label={m.dir === 'out' ? 'Sent' : 'Answer'} className={cx('t-small-strong pt-px text-center', m.dir === 'out' ? 'text-brand-text' : 'text-ok')}>
            {m.dir === 'out' ? '→' : '←'}
          </span>
          <span className="min-w-0">
            <span className="t-small-strong block">
              {m.dir === 'out' ? `To ${m.who}` : m.who}
              {showFrame && m.t && (
                <Link to={`/dashboard/tickets/${m.t.id}`} className="t-small ml-2 text-muted hover:underline">
                  {m.t.frameId}
                </Link>
              )}
            </span>
            <span className="t-small block text-ink">{m.text}</span>
            <span className="t-small block text-muted">{m.how}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One live alert: what failed, where it is, how long, who QC Alert is waiting on, the last message. */
function AlertRow({ s, t, now, onOpen }: { s: MillState; t: Ticket; now: number; onOpen: () => void }) {
  const esc = escalation(t, now);
  const reading = t.readings[0];
  const rule = reading ? ruleFor(s, t.productId, reading.test) : undefined;
  const msgs = messagesFor(s, t, now);
  const lastOut = [...msgs].reverse().find((m) => m.dir === 'out');
  const steps: [string, boolean][] = [
    ['Alert', true],
    ['Fixing', !!t.seenAt],
    ['Fixed', !!t.fixedAt],
    ['Re-test', !!t.fixConfirmedAt],
  ];
  const critical = t.severity === 'critical';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'grid w-full items-center gap-4 rounded-[12px] border p-4 text-left md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]',
        critical ? 'border-critical bg-critical-soft' : 'border-major-fill bg-major-soft',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <SeverityBadge level={t.severity} className="bg-raised" />
          {t.reopened ? <span className="t-small-strong text-critical">Re-test failed, reopened</span> : null}
        </div>
        <p className="t-section mt-2">
          {frameWord(t.frameId)} · {reading ? failWord(rule, reading.test, reading.value) : t.title}
        </p>
        <p className="t-small text-ink">
          {reading ? `${withUnit(reading.test, reading.value)} (limit ${rule?.min ?? '–'}–${rule?.max ?? '–'}) · ` : ''}Lot {t.lotId}
        </p>
        {lastOut && (
          <p className="t-small mt-1 text-muted">
            Last sent {hhmm(lastOut.at)}: to {lastOut.who}
          </p>
        )}
      </div>
      <ol className="flex min-w-[220px] gap-1.5" aria-label="Steps">
        {steps.map(([w, done]) => (
          <li key={w} className="flex flex-1 flex-col gap-1">
            <span className={cx('h-1.5 rounded-full', done ? (critical ? 'bg-critical' : 'bg-major-fill') : 'bg-[var(--grid)]')} />
            <span className={cx('whitespace-nowrap text-[11px]', done ? 'font-semibold text-ink' : 'text-muted')}>{w}</span>
          </li>
        ))}
      </ol>
      <div className="min-w-[150px] text-right">
        <p className={cx('t-stat', !t.seenAt && esc.timer === 'over' ? 'text-critical' : 'text-ink')}>{timer(now - t.alertAt)}</p>
        <p className="t-small text-muted">{t.seenAt ? `${waitingOn(s, t, now)} · ${timer(now - (t.workingAt ?? t.seenAt))}` : `Waiting on ${waitingOn(s, t, now)}`}</p>
        {t.waitingPart && <p className="t-small text-major">Paused: waiting for {t.waitingPart.toLowerCase()}</p>}
      </div>
    </button>
  );
}

function Overall({ s, now }: { s: MillState; now: number }) {
  const data = useMemo(() => {
    const since = mill(millDayKey(now)) - 29 * DAY;
    const month = s.tickets.filter((t) => t.createdAt >= since && t.createdAt <= now && t.severity !== 'minor');
    const answer = month.filter((t) => t.seenAt).map((t) => t.seenAt! - t.alertAt);
    const fixing = month.filter((t) => t.fixedAt && t.workingAt).map((t) => t.fixedAt! - t.workingAt!);
    const parts = new Map<string, number>();
    for (const t of month) if (t.part) parts.set(t.part, (parts.get(t.part) ?? 0) + 1);
    const repeat = new Map<string, number>();
    for (const t of month) repeat.set(t.frameId, (repeat.get(t.frameId) ?? 0) + 1);
    return {
      faults: month.length,
      answer: median(answer),
      fixing: median(fixing),
      made: yarnSaved(s, now, since).avgHeld,
      causes: topCauses(month).slice(0, 5),
      parts: [...parts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
      repeats: [...repeat.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, Math.floor(now / 60000)]);
  return (
    <Panel
      title="This month"
      sub="Last 30 days, critical and major, from the fix reports"
      aside={
        <Link to="/dashboard/report" className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
          Monthly report <ArrowRight size={14} />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Num label="Faults" value={String(data.faults)} />
        <Num label="Median time to I’m fixing" value={data.answer ? timer(data.answer) : '–'} note="limit 5:00" bad={!!data.answer && data.answer > 5 * 60000} />
        <Num label="Median fixing time" value={data.fixing ? ago(data.fixing) : '–'} />
        <Num label="Yarn made before the fix" value={data.made ? `${Math.round(data.made)} kg` : '–'} note="per critical alert, about 250 kg before QC Alert" />
      </dl>
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="t-small-strong mb-2 text-muted">Parts fixed most</p>
          {data.parts.length ? <BarList items={data.parts} /> : <p className="t-small text-muted">No fix reports yet.</p>}
        </div>
        <div>
          <p className="t-small-strong mb-2 text-muted">Causes</p>
          {data.causes.length ? <BarList items={data.causes} /> : <p className="t-small text-muted">No fix reports yet.</p>}
          <p className="t-small-strong mt-4 mb-2 text-muted">Frames that repeat</p>
          {data.repeats.length ? (
            <ul className="flex flex-col gap-1.5">
              {data.repeats.map(([f, n]) => (
                <li key={f} className="flex items-center justify-between">
                  <Link to={`/dashboard/tickets?frame=${f}&tab=all`} className="t-small-strong hover:underline">
                    {f}
                  </Link>
                  <span className="t-small text-muted">{n} faults</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-small text-muted">No frame failed twice.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Num({ label, value, note, bad }: { label: string; value: ReactNode; note?: string; bad?: boolean }) {
  return (
    <div>
      <dt className="t-small text-muted">{label}</dt>
      <dd className={cx('t-stat', bad ? 'text-critical' : 'text-ink')}>{value}</dd>
      {note && <dd className="t-small text-muted">{note}</dd>}
    </div>
  );
}

function Recent({ s, user }: { s: MillState; user: User }) {
  const list = s.tickets
    .filter((t) => t.status === 'closed' && (user.role !== 'supervisor' || covers(user, t.frameId)))
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    .slice(0, 6);
  return (
    <Panel
      title="History"
      sub="Closed alerts with their fix reports"
      aside={
        <Link to="/dashboard/tickets" className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
          All <ArrowRight size={14} />
        </Link>
      }
    >
      <ul className="divide-y divide-[var(--line)]">
        {list.map((t) => (
          <li key={t.id}>
            <Link to={`/dashboard/tickets/${t.id}`} className="grid grid-cols-[14px_56px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 hover:bg-sunken">
              <SeverityShape level={t.severity} />
              <span className="t-small-strong">{t.frameId}</span>
              <span className="t-small min-w-0 truncate">
                {t.closeReason === 'sample_error' ? 'False alarm' : [t.part, t.cause].filter(Boolean).join(' · ') || 'Closed'}
                {t.fixedAt && t.workingAt ? ` · fixed in ${ago(t.fixedAt - t.workingAt)}` : ''}
              </span>
              <span className="t-data text-[12px] text-muted">{dayMonth(t.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
