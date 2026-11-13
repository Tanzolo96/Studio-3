// Overview: alerts, not machines. What failed, who owns it, how long it has been open,
// what is waiting for a decision, and how this month went. Machines are not connected,
// so a frame appears only as a field on a ticket.
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Checkmark } from '@carbon/icons-react';
import type { Hold, MillState, Ticket, User } from '../engine/types';
import { useMillState, useNow, useUser } from '../store/store';
import { bySeverityThenAge, decisionNotices, escalation, holdNeedsApproval, holdNudge, median, openHolds } from '../engine/selectors';
import { covers, failWord, frameWord, holdKg, roundKg, ruleFor, supervisorFor, userName, withUnit } from '../engine/reducer';
import { topCauses } from '../engine/analytics';
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
  return <FloorOverview />;
}

function FloorOverview() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const nav = useNavigate();
  const role = user.role;

  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed' && t.severity !== 'minor').sort(bySeverityThenAge);
  const scoped = role === 'supervisor' ? live.filter((t) => covers(user, t.frameId) || t.seenBy === user.id) : role === 'plant' ? live.filter((t) => escalation(t, now).level >= 2) : live;
  const awaitingRetest = s.tickets.filter((t) => t.status === 'fixed' && !t.fixConfirmedAt).filter((t) => role !== 'supervisor' || covers(user, t.frameId));
  const holds = openHolds(s).sort((a, b) => a.from - b.from);
  const approvals = holds.filter(holdNeedsApproval);
  const notices = decisionNotices(s, user, now);
  const h = millHour(now);
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const weekday = WEEKDAY[new Date(now + 5.5 * HOUR).getUTCDay()];
  const title = role === 'supervisor' ? 'My shift' : role === 'plant' ? 'Plant overview' : 'Overview';

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
          <p className="t-small mt-1 text-muted">{title}: only failed tests show here. On a day with no fails there is nothing to do.</p>
        </div>
        <StatusPill n={scoped.length} critical={scoped.some((t) => t.severity === 'critical')} />
      </header>

      {/* 1. Live alerts */}
      <Panel title="Live alerts" sub={scoped.length ? `${scoped.length} failed test${scoped.length > 1 ? 's' : ''} not fixed yet` : role === 'plant' ? 'Nothing escalated to you' : 'No open alerts'}>
        {scoped.length ? (
          <div className="flex flex-col gap-3">
            {scoped.map((t) => (
              <AlertRow key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/dashboard/tickets/${t.id}`)} />
            ))}
          </div>
        ) : (
          <Calm text={role === 'supervisor' ? 'No failed tests on your frames. A new one rings your phone first.' : 'No failed test is waiting for anyone.'} />
        )}
      </Panel>

      {(notices.length > 0 || awaitingRetest.length > 0) && (
        <div className={cx('grid gap-6', awaitingRetest.length > 0 && notices.length > 0 && 'lg:grid-cols-2')}>
          {awaitingRetest.length > 0 && (
            <Panel title="Fixed, waiting for the lab re-test" sub="Nothing closes on a promise: a pass confirms the fix, a fail sends it back to the line">
              <ul className="divide-y divide-[var(--line)]">
                {awaitingRetest.map((t) => {
                  const hold = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
                  const r = s.requests.find((q) => q.ticketId === t.id && q.reason === 'retest' && q.status === 'pending');
                  return (
                    <li key={t.id}>
                      <Link to={`/dashboard/tickets/${t.id}`} className="flex items-center gap-3 py-2.5 hover:bg-sunken">
                        <SeverityShape level={t.severity} />
                        <span className="t-small-strong w-16">{t.frameId}</span>
                        <span className="t-small flex-1 text-ink">
                          {`Re-test ${r ? `due ${hhmm(r.dueAt)}` : 'asked'}`}
                          {hold && hold.status === 'on_hold' ? ` · ${roundKg(holdKg(hold, now))} kg held` : ''}
                        </span>
                        <ArrowRight size={16} className="text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          {notices.length > 0 && (
            <Panel title="Yarn to move" sub="The QC manager decided. Move the yarn and update the tag on the phone.">
              <ul className="divide-y divide-[var(--line)]">
                {notices.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 py-2.5">
                    <span className="t-small-strong w-16">{h.frameId}</span>
                    <span className="t-small flex-1">{h.status === 'released' ? 'Release: remove tag, send to winding' : h.status === 'reprocess' ? 'Reprocess: keep tag, move to reprocess' : 'Downgrade: keep tag, move to lower grade'}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {/* 2. Waiting for a decision */}
      {role !== 'supervisor' && (
        <Panel
          title={role === 'plant' ? 'Waiting for your sign-off' : 'Waiting for a decision'}
          sub={role === 'plant' ? 'Releases against a failed test, and holds left undecided past the end of the shift' : 'Held yarn and how long it has waited. Reminder at 2 hours, plant head at the end of the shift.'}
          aside={
            <Link to="/dashboard/held" className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
              Held yarn <ArrowRight size={14} />
            </Link>
          }
        >
          <HoldList s={s} now={now} holds={role === 'plant' ? holds.filter((h) => holdNeedsApproval(h) || holdNudge(s, h, now) === 'plant') : holds} approvals={approvals} user={user} />
        </Panel>
      )}

      {/* 3. Overall + 4. History */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Overall s={s} now={now} />
        <Recent s={s} now={now} user={user} />
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
  return (
    <p className={cx('t-small-strong flex items-center gap-2 rounded-full px-4 py-2', critical ? 'bg-critical text-on-critical' : 'bg-major-soft text-major')}>
      {n} live alert{n > 1 ? 's' : ''}
    </p>
  );
}

function Calm({ text }: { text: string }) {
  return (
    <p className="t-small flex items-center gap-2 rounded-[10px] bg-sunken px-4 py-3 text-muted">
      <Checkmark size={16} className="text-ok" /> {text}
    </p>
  );
}

/** One failed test: what, how serious, who owns it, how long, and where it is in the nine steps. */
function AlertRow({ s, t, now, onOpen }: { s: MillState; t: Ticket; now: number; onOpen: () => void }) {
  const esc = escalation(t, now);
  const reading = t.readings[0];
  const rule = reading ? ruleFor(s, t.productId, reading.test) : undefined;
  const hold = t.holdId ? s.holds.find((h) => h.id === t.holdId) : undefined;
  const sup = supervisorFor(s, t.frameId, t.alertAt);
  const owner = t.seenBy
    ? `${userName(s, t.seenBy).split(' ')[0]} owns it`
    : esc.level >= 2
      ? 'Waiting on the plant head'
      : esc.level === 1
        ? 'Waiting on the QC manager'
        : esc.backup
          ? 'Waiting on the backup supervisor'
          : `Waiting on ${sup ? sup.name.split(' ')[0] : 'the supervisor'}`;
  const steps: [string, boolean][] = [
    ['Seen', !!t.seenAt],
    ...(hold ? ([['Held', !!hold.taggedAt]] as [string, boolean][]) : []),
    ['Line', !!t.lineAction],
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
          {frameWord(t.frameId)} · {reading ? `${failWord(rule, reading.test, reading.value)}` : t.title}
        </p>
        <p className="t-small text-ink">
          {reading ? `${withUnit(reading.test, reading.value)} (limit ${rule?.min ?? '–'}–${rule?.max ?? '–'})` : ''} · Lot {t.lotId}
          {hold ? ` · ${roundKg(holdKg(hold, now))} kg held${hold.taggedAt ? '' : ', not tagged yet'}` : ''}
        </p>
      </div>
      <ol className="flex min-w-[240px] gap-1.5" aria-label="Steps">
        {steps.map(([w, done]) => (
          <li key={w} className="flex flex-1 flex-col gap-1">
            <span className={cx('h-1.5 rounded-full', done ? (critical ? 'bg-critical' : 'bg-major-fill') : 'bg-[var(--grid)]')} />
            <span className={cx('whitespace-nowrap text-[11px]', done ? 'font-semibold text-ink' : 'text-muted')}>{w}</span>
          </li>
        ))}
      </ol>
      <div className="min-w-[150px] text-right">
        <p className={cx('t-stat', !t.seenAt && esc.timer === 'over' ? 'text-critical' : 'text-ink')}>{timer(now - t.alertAt)}</p>
        <p className="t-small text-muted">open · {owner}</p>
        {t.waitingPart && <p className="t-small text-major">Paused: waiting for {t.waitingPart.toLowerCase()}</p>}
      </div>
    </button>
  );
}

function HoldList({ s, now, holds, approvals, user }: { s: MillState; now: number; holds: Hold[]; approvals: Hold[]; user: User }) {
  if (!holds.length) return <Calm text="No held yarn is waiting." />;
  return (
    <ul className="divide-y divide-[var(--line)]">
      {holds.map((h) => {
        const t = s.tickets.find((x) => x.id === h.ticketId);
        const nudge = holdNudge(s, h, now);
        const waited = now - (t?.createdAt ?? h.from);
        const needs = approvals.includes(h);
        return (
          <li key={h.id}>
            <Link to="/dashboard/held" className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 py-3 hover:bg-sunken">
              <span className="t-small-strong">{h.frameId}</span>
              <span className="min-w-0">
                <span className="t-small-strong block">
                  {roundKg(holdKg(h, now))} kg · Lot {h.lotId}
                  {!h.taggedAt && <span className="ml-2 text-major">not tagged yet</span>}
                </span>
                <span className="t-small block text-muted">
                  {needs ? 'Release asked against a failed test: needs the plant head' : h.retest === 'passed' ? 'Re-test passed: ready to decide' : h.retest === 'failed' ? 'Re-test failed' : h.retest === 'pending' ? 'Re-test in the lab' : 'Not re-tested yet'}
                </span>
              </span>
              <span className="text-right">
                <span className={cx('t-data block', nudge !== 'none' ? 'text-critical' : 'text-ink')}>waiting {ago(waited)}</span>
                <span className="t-small block text-muted">{needs ? (user.role === 'plant' ? 'Approve' : 'With plant head') : nudge === 'plant' ? 'Plant head told' : nudge === 'qc' ? 'Reminder sent' : 'Decide'}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Overall({ s, now }: { s: MillState; now: number }) {
  const data = useMemo(() => {
    const since = mill(millDayKey(now)) - 29 * DAY;
    const month = s.tickets.filter((t) => t.createdAt >= since && t.createdAt <= now && t.severity !== 'minor');
    const seen = month.filter((t) => t.seenAt).map((t) => t.seenAt! - t.alertAt);
    const fix = month.filter((t) => t.fixedAt).map((t) => t.fixedAt! - t.alertAt);
    const holds = s.holds.filter((h) => month.some((t) => t.id === h.ticketId));
    const held = holds.reduce((a, h) => a + holdKg(h, now), 0);
    const released = holds.filter((h) => h.status === 'released').reduce((a, h) => a + holdKg(h, now), 0);
    const repeat = new Map<string, number>();
    for (const t of month) repeat.set(t.frameId, (repeat.get(t.frameId) ?? 0) + 1);
    return {
      faults: month.length,
      seen: median(seen),
      fix: median(fix),
      held,
      released,
      causes: topCauses(month).slice(0, 5),
      repeats: [...repeat.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, Math.floor(now / 60000)]);
  return (
    <Panel
      title="This month"
      sub="Last 30 days, critical and major"
      aside={
        <Link to="/dashboard/report" className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
          Monthly report <ArrowRight size={14} />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Num label="Faults" value={String(data.faults)} />
        <Num label="Median to Seen" value={data.seen ? timer(data.seen) : '–'} note="limit 5:00" bad={!!data.seen && data.seen > 5 * 60000} />
        <Num label="Median to fixed" value={data.fix ? ago(data.fix) : '–'} />
        <Num label="Yarn held" value={`${roundKg(data.held).toLocaleString('en-IN')} kg`} note={`${roundKg(data.released).toLocaleString('en-IN')} kg released`} />
      </dl>
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="t-small-strong mb-2 text-muted">Top causes</p>
          {data.causes.length ? <BarList items={data.causes} /> : <p className="t-small text-muted">No fixes yet.</p>}
        </div>
        <div>
          <p className="t-small-strong mb-2 text-muted">Frames that repeat</p>
          {data.repeats.length ? (
            <ul className="flex flex-col gap-1.5">
              {data.repeats.map(([f, n]) => (
                <li key={f} className="flex items-center justify-between">
                  <Link to={`/dashboard/tickets?frame=${f}`} className="t-small-strong hover:underline">
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

function Recent({ s, now, user }: { s: MillState; now: number; user: User }) {
  const list = s.tickets
    .filter((t) => t.status === 'closed' && (user.role !== 'supervisor' || covers(user, t.frameId)))
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    .slice(0, 6);
  return (
    <Panel
      title="History"
      sub="Every past fault: cause, response times, yarn and decision"
      aside={
        <Link to="/dashboard/tickets" className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
          All <ArrowRight size={14} />
        </Link>
      }
    >
      <ul className="divide-y divide-[var(--line)]">
        {list.map((t) => {
          const hold = t.holdId ? s.holds.find((h) => h.id === t.holdId) : undefined;
          return (
            <li key={t.id}>
              <Link to={`/dashboard/tickets/${t.id}`} className="grid grid-cols-[14px_56px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 hover:bg-sunken">
                <SeverityShape level={t.severity} />
                <span className="t-small-strong">{t.frameId}</span>
                <span className="t-small min-w-0 truncate">
                  {t.closeReason === 'sample_error' ? 'False alarm' : t.cause ?? 'Closed'}
                  {t.raisedBy ? ' · raised by hand' : t.seenAt ? ` · seen in ${timer(t.seenAt - t.alertAt)}` : ''}
                  {hold ? ` · ${roundKg(holdKg(hold, now))} kg ${hold.status === 'released' ? 'released' : hold.status}` : ''}
                </span>
                <span className="t-data text-[12px] text-muted">{dayMonth(t.createdAt)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

