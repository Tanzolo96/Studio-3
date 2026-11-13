import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Checkmark, ChevronRight } from '@carbon/icons-react';
import type { MillState, Severity, TestKind, Ticket, User } from '../engine/types';
import { useDispatch, useMill, useMillState, useNow, useUser } from '../store/store';
import { decisionNotices, escalation, fitterJobs, labBacklog, median, myTickets, pendingRequests, seenTimes, timeline } from '../engine/selectors';
import { failWord, frameWord, holdKg, lotOf, productOfFrame, roundKg, ruleFor, supervisorFor, userName, withinRule, withUnit } from '../engine/reducer';
import { CAUSE_HINT, CAUSES, MACHINE_PARTS, RAISE_PROBLEMS, TEST } from '../engine/vocab';
import { ago, dayMonth, hhmm, monthName, shiftAt, timer } from '../engine/time';
import { Button, Choice, cx, Empty, Field, SeverityBadge, SeverityShape, TextField } from '../ui/primitives';
import { ReadingGauge, ResponseTimer, TicketCard, ticketMeta } from '../ui/cards';
import { Timeline } from '../ui/timeline';
import { readPhoto, Sheet } from './Sheet';
import { FloorCard, PlantEscalationBlock, PlantPhoneHome, pastCauses } from './plantPhone';

function Page({ title, sub, back, children }: { title: string; sub?: string; back?: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-8">
      {back && (
        <Link to={back} className="t-small-strong -ml-2 mb-2 inline-flex h-12 items-center gap-1 rounded-[10px] px-2 text-brand-text hover:bg-brand-soft">
          <ArrowLeft size={20} /> Back
        </Link>
      )}
      <h1 className="t-page">{title}</h1>
      {sub && <p className="t-small mt-1 text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const first = (u: User) => u.name.split(' ')[0];

// ================= Alerts tab =================
export function AlertsScreen() {
  const user = useUser('app');
  if (user.role === 'tester') return <TestRequests user={user} />;
  if (user.role === 'fitter') return <RepairJobs user={user} />;
  if (user.role === 'operator') return <OperatorHome user={user} />;
  return <MyTickets user={user} />;
}

/** The machine operator: faults on his frames, if any. He reports, the supervisor owns the fix. */
function OperatorHome({ user }: { user: User }) {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const live = myTickets(s, user, now).filter((t) => t.status !== 'closed');
  const sup = supervisorFor(s, `RF-${String(user.frames?.[0] ?? 1).padStart(2, '0')}`, now);
  return (
    <Page title="My frames" sub={`${user.shift} shift · ${first(user)} · frames ${user.frames?.[0]}–${user.frames?.[1]}`}>
      <p className="t-small-strong mb-2 text-muted">{live.length ? `${live.length} fault${live.length === 1 ? '' : 's'} on your frames` : 'No faults on your frames'}</p>
      {live.length ? (
        <div className="flex flex-col gap-3">
          {live.map((t) => (
            <TicketCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/app/ticket/${t.id}`)} />
          ))}
        </div>
      ) : (
        <p className="t-small text-muted">If a lab test fails on one of your frames it shows here, so you know before anyone asks.</p>
      )}
      <p className="t-small mt-6 rounded-[10px] bg-sunken px-3 py-2.5 text-ink">
        {sup ? `${sup.name} (supervisor) owns these alerts and gets them with sound.` : 'Your supervisor owns these alerts.'} Saw something wrong before the next test? Use Raise ticket.
      </p>
    </Page>
  );
}

function MyTickets({ user }: { user: User }) {
  if (user.role === 'plant') return <PlantPhoneHome user={user} />;
  return <MyTicketsList user={user} />;
}

function MyTicketsList({ user }: { user: User }) {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const live = myTickets(s, user, now).filter((t) => t.status !== 'fixed');
  const waitingRetest = myTickets(s, user, now).filter((t) => t.status === 'fixed');
  const notices = decisionNotices(s, user, now);
  const dispatch = useDispatch();
  const onShift = user.shift === 'G' || user.shift === shiftAt(now);
  const sub =
    user.role === 'supervisor'
      ? `${user.shift} shift · ${first(user)}${onShift ? '' : ' · off shift'}`
      : `${first(user)} · ${user.role === 'qc' ? 'escalations and held yarn' : 'escalations only'}`;
  return (
    <Page title="Active issues" sub={sub}>
      {notices.map((h) => (
        <section key={h.id} className="mb-3 rounded-[16px] border border-ink bg-raised p-4 shadow-raised" aria-label="Yarn decision">
          <p className="t-small-strong text-muted">
            Yarn decision · {frameWord(h.frameId)} · Lot {h.lotId} · {roundKg(holdKg(h, now))} kg
          </p>
          <p className="t-section mt-1">
            {h.status === 'released' ? 'Release: remove the red tag, send it to winding' : h.status === 'reprocess' ? 'Reprocess: keep the tag, move it to reprocess' : 'Downgrade: keep the tag, move it to lower grade'}
          </p>
          <Button size="lg" block className="mt-3" onClick={() => dispatch({ type: 'hold/moved', holdId: h.id, by: user.id })}>
            Done, yarn moved
          </Button>
        </section>
      ))}
      {live.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[16px] bg-raised px-6 py-12 text-center shadow-raised">
          <span className="grid size-16 place-items-center rounded-full bg-ok-soft text-ok">
            <Checkmark size={32} />
          </span>
          <p className="t-section">All clear</p>
          <p className="t-small max-w-[30ch] text-muted">
            {user.role === 'supervisor' ? 'No active issues. Every frame is running normally. A new fault will ring this phone.' : 'Nothing has been escalated to you.'}
          </p>
          <Link to="/app/previous" className="t-small-strong mt-1 inline-flex h-12 items-center rounded-[10px] px-3 text-brand-text hover:bg-brand-soft">
            See resolved issues in History
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="t-small-strong text-muted">
            {live.length} need{live.length === 1 ? 's' : ''} attention
          </p>
          {live.map((t) =>
            user.role === 'supervisor' ? (
              <FloorCard key={t.id} s={s} t={t} now={now} user={user} onOpen={() => nav(`/app/ticket/${t.id}`)} />
            ) : (
              <TicketCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/app/ticket/${t.id}`)} />
            ),
          )}
        </div>
      )}
      {waitingRetest.length > 0 && (
        <>
          <p className="t-small-strong mt-6 mb-2 text-muted">Fixed, waiting for the lab re-test or the yarn decision</p>
          <div className="flex flex-col gap-3">
            {waitingRetest.map((t) => (
              <TicketCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/app/ticket/${t.id}`)} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

const REASON: Record<string, string> = {
  drift: 'Asked to test sooner',
  sister: 'Other frame on the same lot',
  retest: 'Re-test after the fix',
  manual: 'Asked to test now',
};

function TestRequests({ user }: { user: User }) {
  const s = useMillState();
  const now = useNow();
  const list = pendingRequests(s);
  const behind = labBacklog(s, now).length;
  return (
    <Page title="Lab" sub={`${user.shift} shift lab · ${first(user)}`}>
      <Link to="/app/fail" className="t-body-strong mb-4 flex h-14 items-center justify-center gap-2 rounded-[12px] bg-critical text-on-critical shadow-raised">
        <SeverityShape level="critical" className="[&_path]:fill-[var(--on-critical)]" /> Report a failed test
      </Link>
      <p className="t-small -mt-2 mb-4 text-muted">Only for readings outside the limit. Passing tests stay in the register as today.</p>
      {behind >= 3 && (
        <p className="t-small-strong mb-3 rounded-[10px] bg-major-soft px-3 py-2.5 text-major">{behind} urgent tests are late. The QC manager has been told.</p>
      )}
      <p className="t-small-strong mb-2 text-muted">Urgent tests from the floor</p>
      {list.length === 0 ? (
        <Empty icon={<Checkmark size={32} />} title="Nothing urgent" body="Re-tests after a fix and checks on other frames of the same lot show up here, riskiest first." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r, i) => {
            const product = productOfFrame(s, r.frameId);
            const late = now > r.dueAt;
            const sev = r.ticketId ? s.tickets.find((x) => x.id === r.ticketId)?.severity : undefined;
            return (
              <li key={r.id}>
                <Link
                  to={`/app/test/${r.id}`}
                  className={cx('flex items-center gap-3 rounded-[10px] border bg-raised p-4 shadow-raised hover:bg-sunken', r.urgent ? 'border-major-fill' : 'border-line')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="t-data grid size-6 place-items-center rounded-full bg-sunken text-[12px]">{i + 1}</span>
                      {r.urgent && (
                        <span className={cx('t-label inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2', sev === 'critical' ? 'bg-critical-soft text-critical' : 'bg-major-soft text-major')}>
                          <SeverityShape level={sev === 'critical' ? 'critical' : 'major'} /> Urgent
                        </span>
                      )}
                      <span className="t-small text-muted">{REASON[r.reason]}</span>
                    </div>
                    <p className="t-body-strong mt-2">
                      {TEST[r.test].name} test on {frameWord(r.frameId)}
                    </p>
                    <p className="t-small text-muted">
                      Lot {lotOf(s, s.frames.find((f) => f.id === r.frameId)!.lotId).id} · {product.short} · {TEST[r.test].instrument}
                    </p>
                    <p className={cx('t-data mt-2', late ? 'text-critical' : 'text-ink')}>
                      {late ? (now - r.dueAt < 60_000 ? 'Due now' : `Late by ${ago(now - r.dueAt)}`) : `Due ${hhmm(r.dueAt)} · in ${timer(r.dueAt - now)}`}
                    </p>
                  </div>
                  <ChevronRight size={20} className="shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

function RepairJobs({ user }: { user: User }) {
  const s = useMillState();
  const now = useNow();
  const jobs = fitterJobs(s, user.id);
  return (
    <Page title="Repair jobs" sub={`${user.shift} shift · ${first(user)} · ${jobs.length} open`}>
      {jobs.length === 0 ? (
        <Empty icon={<Checkmark size={32} />} title="No repair jobs" body="When a supervisor sends you a frame, it shows up here with what failed." />
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((t) => (
            <RepairJob key={t.id} s={s} t={t} now={now} user={user} />
          ))}
        </ul>
      )}
    </Page>
  );
}

function RepairJob({ s, t, now, user }: { s: MillState; t: Ticket; now: number; user: User }) {
  const dispatch = useDispatch();
  const [parts, setParts] = useState<string | null>(null);
  const past = pastCauses(s, t);
  return (
            <li className="rounded-[10px] border border-line bg-raised p-4 shadow-raised">
              <div className="flex items-center justify-between">
                <SeverityBadge level={t.severity} />
                <span className="t-data text-[13px] text-muted">sent {ago(now - (t.events.findLast((e) => e.kind === 'fitter_assigned')?.at ?? now))} ago</span>
              </div>
              <p className="t-section mt-3">{frameWord(t.frameId)}</p>
              <p className="t-body">{t.title}</p>
              <p className="t-small mt-1 text-muted">
                {ticketMeta(s, t)} · from {userName(s, t.seenBy)}
              </p>
              {past.length > 0 && (
                <div className="mt-3 rounded-[10px] bg-sunken px-3 py-2.5">
                  <p className="t-small-strong">Fixed on this frame before</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {past.map((p) => (
                      <li key={p.at} className="t-small flex justify-between gap-3">
                        <span>{p.cause}</span>
                        <span className="t-data text-[12px] text-muted">{dayMonth(p.at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {t.waitingParts && (
                <p className="t-small mt-3 rounded-[10px] bg-major-soft px-3 py-2.5 text-ink">
                  <span className="t-small-strong">Waiting for parts:</span> {t.waitingParts.note}. Krish can see this.
                </p>
              )}
              <Button size="lg" block className="mt-4" onClick={() => dispatch({ type: 'ticket/repairDone', ticketId: t.id, by: user.id })}>
                Mark repair done
              </Button>
              {!t.waitingParts && parts === null && (
                <Button size="lg" block variant="ghost" className="mt-2" onClick={() => setParts('')}>
                  Can't fix it now
                </Button>
              )}
              {parts !== null && (
                <form
                  className="mt-3 flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (parts.trim().length < 3) return;
                    dispatch({ type: 'ticket/needsParts', ticketId: t.id, note: parts.trim(), by: user.id });
                    setParts(null);
                  }}
                >
                  <TextField label="What do you need?" value={parts} onChange={(e) => setParts(e.target.value)} hint="For example: top roller cot from the store" autoFocus />
                  <div className="flex gap-2">
                    <Button type="submit" block disabled={parts.trim().length < 3}>
                      Tell Krish
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setParts(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </li>
  );
}

// ================= Ticket detail =================
export function TicketScreen() {
  const { id } = useParams();
  const s = useMillState();
  const now = useNow();
  const user = useUser('app');
  const t = s.tickets.find((x) => x.id === id);
  if (!t) return <Page title="Ticket not found" back="/app">{null}</Page>;
  return <TicketDetail s={s} t={t} now={now} user={user} />;
}

type StepState = 'done' | 'active' | 'todo';

function Step({ n, title, state, when, children }: { n: number; title: string; state: StepState; when?: string; children?: ReactNode }) {
  return (
    <li className={cx('rounded-[14px] border p-3.5', state === 'active' ? 'border-ink bg-raised shadow-raised' : 'border-line bg-raised', state === 'todo' && 'opacity-55')}>
      <div className="flex items-center gap-3">
        <span
          className={cx(
            't-small-strong grid size-7 shrink-0 place-items-center rounded-full',
            state === 'done' ? 'bg-ok text-[var(--surface-raised)]' : state === 'active' ? 'bg-ink text-[var(--surface-raised)]' : 'bg-sunken text-muted',
          )}
        >
          {state === 'done' ? <Checkmark size={16} /> : n}
        </span>
        <span className={cx('t-body-strong flex-1', state === 'todo' && 'text-muted')}>{title}</span>
        {when && <span className="t-data text-[12px] text-muted">{when}</span>}
      </div>
      {state === 'active' && children && <div className="mt-3 flex flex-col gap-2 pl-10">{children}</div>}
    </li>
  );
}

function TicketDetail({ s, t, now, user }: { s: MillState; t: Ticket; now: number; user: User }) {
  const dispatch = useDispatch();
  const [sheet, setSheet] = useState<'fitter' | 'fixed' | 'handover' | 'part' | null>(null);
  const esc = escalation(t, now);
  const reading = t.readings.find((r) => r.at === t.alertAt) ?? t.readings[0];
  const lastReading = t.readings.at(-1);
  const rule = reading && t.kind === 'test_fail' ? ruleFor(s, t.productId, reading.test) : undefined;
  const hold = t.holdId ? s.holds.find((h) => h.id === t.holdId) : undefined;
  // The plant head reads and calls; the supervisor (or the QC manager covering) acts.
  const canAct = user.role === 'supervisor' || user.role === 'qc';
  const isSupervisor = canAct;
  const fitter = t.fitterId ? userName(s, t.fitterId) : undefined;
  const product = s.products.find((p) => p.id === t.productId)!;
  const retest = s.requests.find((r) => r.ticketId === t.id && r.reason === 'retest' && r.status === 'pending');
  const closed = t.status === 'closed';
  const by = (id?: string) => (id ? userName(s, id).split(' ')[0] : '');

  const issue =
    t.kind === 'manual'
      ? t.title
      : reading
        ? `${failWord(rule, reading.test, reading.value)}: ${withUnit(reading.test, reading.value)}`
        : t.title;
  const outcome =
    t.closeReason === 'sample_error'
      ? 'False alarm. The lab sample was bad.'
      : t.closeReason === 'checked_ok'
        ? 'Checked, OK. The lab test passed.'
        : t.cause
          ? `Cause: ${t.cause.toLowerCase()}${t.note ? ` (${t.note.toLowerCase()})` : ''}`
          : '';

  // Status panel: one plain answer.
  const panel = closed
    ? { tone: 'ok', head: 'Resolved', line: `${t.fixedAt ? `Fixed at ${hhmm(t.fixedAt)} by ${by(t.fixedBy)}, confirmed by re-test. ` : `Closed at ${hhmm(t.closedAt!)}. `}${outcome}` }
    : t.status === 'fixed'
      ? t.fixConfirmedAt
        ? { tone: 'wait', head: 'Fix confirmed', line: 'Re-test passed. Waiting for the QC manager to decide on the held yarn.' }
        : { tone: 'wait', head: 'Fixed, waiting for re-test', line: `The lab re-tests ${frameWord(t.frameId)}${retest ? ` by ${hhmm(retest.dueAt)}` : ''}. If it fails, this comes back to you.` }
      : t.status === 'open'
        ? {
            tone: t.severity,
            head: t.reopened ? 'Re-test failed' : 'Not resolved yet',
            line: esc.level > 0 ? `Nobody has started fixing for ${Math.floor(esc.elapsed / 60000)} min. ${esc.level === 2 ? 'Plant head told.' : 'QC manager told.'}` : esc.backup ? `No answer in ${t.seenMins} min. Backup supervisor alerted.` : 'Waiting for someone to start fixing',
          }
        : { tone: t.severity, head: 'Not resolved yet', line: t.waitingPart ? `Waiting for a spare part: ${t.waitingPart}` : fitter && !t.repairDoneAt ? `${fitter.split(' ')[0]} is repairing the frame` : `${by(t.seenBy)} is fixing it · ${timer(now - (t.workingAt ?? t.seenAt ?? now))}` };

  // Steps, in order. The first one not done is the one to do now.
  // Alert -> Fixing -> Fixed + report -> lab re-test. The first step not done is the one to do now.
  const steps = [
    { key: 'seen', title: 'Fixing: I\u2019m on it', done: !!t.seenAt, when: t.seenAt },
    { key: 'fixed', title: 'Fixed: tell us what happened', done: !!t.fixedAt || closed, when: t.fixedAt },
    ...(t.kind === 'manual' && !t.test ? [] : [{ key: 'retest', title: 'Lab re-test confirms the fix', done: !!t.fixConfirmedAt || (closed && t.closeReason !== 'fixed'), when: t.fixConfirmedAt }]),
  ];
  const activeIdx = closed ? -1 : steps.findIndex((x) => !x.done);
  const stateOf = (i: number): StepState => (steps[i].done ? 'done' : i === activeIdx ? 'active' : 'todo');

  const body = (key: string): ReactNode => {
    if (!canAct) return null;
    switch (key) {
      case 'seen':
        return (
          <>
            <Button size="lg" block variant={t.severity === 'critical' ? 'danger' : 'primary'} onClick={() => dispatch({ type: 'ticket/working', ticketId: t.id, by: user.id })}>
              I’m fixing it
            </Button>
            <p className="t-small text-muted">Starts the fixing time and stops the alert going to anyone else.</p>
          </>
        );
      case 'fixed':
        return (
          <>
            <p className="t-small text-ink">
              Fixing for <span className="t-data">{timer(now - (t.workingAt ?? t.seenAt ?? now))}</span>. When the frame is running right, tap Fixed and say what happened.
            </p>
            {t.waitingPart ? (
              <>
                <p className="t-small rounded-[10px] bg-major-soft px-3 py-2.5 text-ink">
                  <span className="t-small-strong">Waiting for a spare part:</span> {t.waitingPart}. The timer is paused.
                </p>
                <Button size="lg" block variant="secondary" onClick={() => dispatch({ type: 'ticket/partArrived', ticketId: t.id, by: user.id })}>
                  Part arrived
                </Button>
              </>
            ) : fitter && !t.repairDoneAt ? (
              <p className="t-small rounded-[10px] bg-major-soft px-3 py-2.5 text-ink">
                <span className="t-small-strong">{fitter}</span> is repairing the frame
              </p>
            ) : null}
            <Button size="lg" block variant={t.repairDoneAt || !fitter ? 'primary' : 'secondary'} onClick={() => setSheet('fixed')}>
              Fixed
            </Button>
            {!t.fitterId && (
              <Button variant="ghost" block onClick={() => setSheet('fitter')}>
                Send a fitter
              </Button>
            )}
            {!t.waitingPart && (
              <Button variant="ghost" block onClick={() => setSheet('part')}>
                Waiting for a spare part
              </Button>
            )}
          </>
        );
      case 'retest':
        return user.role === 'qc' && retest ? (
          <Link to={`/app/test/${retest.id}`} className="t-body-strong flex h-12 items-center justify-center rounded-[10px] border border-line bg-raised text-brand-text">
            Enter the re-test result
          </Link>
        ) : (
          <p className="t-small text-ink">At the top of the lab’s list{retest ? `, due ${hhmm(retest.dueAt)}` : ''}. A pass confirms the fix; a fail sends this back to you.</p>
        );
    }
    return null;
  };

  const notice = hold && hold.status !== 'on_hold' && hold.taggedAt && !hold.movedAt && isSupervisor;

  return (
    <Page title={frameWord(t.frameId)} back="/app">
      <p className="t-body -mt-3 text-ink">{issue}</p>
      <p className="t-small mt-1 text-muted">
        Lot {t.lotId} · {product.name} · {t.id}
      </p>

      <section
        aria-label="Is it resolved?"
        className={cx(
          'mt-4 flex items-center gap-4 rounded-[16px] p-4',
          panel.tone === 'ok' ? 'bg-ok-soft' : panel.tone === 'wait' ? 'bg-sunken' : panel.tone === 'critical' ? 'bg-critical-soft' : panel.tone === 'major' ? 'bg-major-soft' : 'bg-sunken',
        )}
      >
        <span className={cx('grid size-12 shrink-0 place-items-center rounded-full', closed ? 'bg-ok text-[var(--surface-raised)]' : 'bg-raised')}>
          {closed ? <Checkmark size={28} /> : <SeverityShape level={t.severity} size={22} />}
        </span>
        <div className="min-w-0">
          <p className={cx('t-alert', closed ? 'text-ok' : panel.tone === 'wait' ? 'text-ink' : t.severity === 'critical' ? 'text-critical' : t.severity === 'major' ? 'text-major' : 'text-ink')}>{panel.head}</p>
          <p className="t-small text-ink">{panel.line}</p>
        </div>
      </section>
      {user.role === 'plant' && !closed && <PlantEscalationBlock s={s} t={t} now={now} />}

      {t.status === 'open' && t.severity !== 'minor' && (
        <section className="mt-4">
          <ResponseTimer elapsed={esc.elapsed} limitMins={t.seenMins} state={esc.timer} level={esc.level} />
        </section>
      )}

      {notice && (
        <section className="mt-4 rounded-[16px] border border-ink bg-raised p-4 shadow-raised" aria-label="Yarn decision">
          <p className="t-small-strong text-muted">Yarn decision from the QC manager</p>
          <p className="t-section mt-1">
            {hold!.status === 'released' ? 'Release: remove the red tag, send the yarn to winding' : hold!.status === 'reprocess' ? 'Reprocess: keep the tag, move the yarn to reprocess' : 'Downgrade: keep the tag, move the yarn to lower grade'}
          </p>
          <Button size="lg" block className="mt-3" onClick={() => dispatch({ type: 'hold/moved', holdId: hold!.id, by: user.id })}>
            Done, yarn moved
          </Button>
        </section>
      )}

      <ol className="mt-5 flex flex-col gap-2" aria-label="Steps">
        {steps.map((st, i) => (
          <Step key={st.key} n={i + 1} title={st.title} state={stateOf(i)} when={st.when ? hhmm(st.when) : undefined}>
            {body(st.key)}
          </Step>
        ))}
      </ol>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {lastReading && (
          <section className="col-span-2 rounded-[16px] border border-line bg-raised p-4">
            <ReadingGauge test={lastReading.test} value={lastReading.value} min={rule?.min ?? lastReading.min} max={rule?.max ?? lastReading.max} />
            {t.readings.length > 1 && <p className="t-small mt-3 text-muted">{t.readings.length} readings on this issue, latest shown</p>}
          </section>
        )}
        {hold && (
          <section className="rounded-[16px] bg-held-soft p-4">
            <p className="t-small text-held">Yarn held{hold.taggedAt ? ', tagged' : ''}</p>
            <p className="t-stat text-held">
              {roundKg(holdKg(hold, now))}
              <span className="t-small ml-1">kg</span>
            </p>
            <p className="t-small mt-1 text-ink">{hold.status === 'on_hold' ? (hold.to ? 'Not growing' : `Since ${hhmm(hold.from)}, still growing`) : hold.status === 'released' ? 'Released' : hold.status === 'reprocess' ? 'Sent to reprocess' : 'Sold as lower grade'}</p>
          </section>
        )}
        {t.sisterFrames.length > 0 && (
          <section className="rounded-[16px] border border-line bg-raised p-4">
            <p className="t-small text-muted">Other frames on Lot {t.lotId}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {t.sisterFrames.map((f) => {
                const r = s.requests.find((q) => q.ticketId === t.id && q.frameId === f && q.reason === 'sister');
                const res = r?.resultId ? s.results.find((x) => x.id === r.resultId) : undefined;
                const st = res ? (res.pass ? 'ok' : 'bad') : r?.status === 'cancelled' ? 'skip' : 'wait';
                return (
                  <li key={f} className="flex items-center justify-between">
                    <span className="t-data">{f}</span>
                    <span className={cx('t-small-strong', st === 'ok' ? 'text-ok' : st === 'bad' ? 'text-critical' : 'text-muted')}>
                      {st === 'ok' ? 'Passed' : st === 'bad' ? 'Failed' : st === 'skip' ? 'Not needed' : 'Testing'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {t.photo && <img src={t.photo} alt={`Photo added when ${frameWord(t.frameId)} was fixed`} className="mt-4 w-full rounded-[16px] border border-line" />}

      {t.rca && (
        <p className="t-small mt-4 rounded-[10px] bg-sunken px-3 py-2.5 text-ink">
          <span className="t-small-strong">Root-cause check open.</span> No cause was found, so the QC manager follows up.
        </p>
      )}

      <details className="group mt-5 rounded-[16px] border border-line bg-raised">
        <summary className="t-small-strong flex h-12 cursor-pointer list-none items-center justify-between px-4 text-ink">
          Full history · {timeline(t, now).length} updates
          <ChevronRight size={20} className="text-muted transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-line px-4 pt-4">
          <Timeline s={s} t={t} now={now} dense />
        </div>
      </details>

      {canAct && !closed && t.status !== 'fixed' && (
        <Button variant="ghost" block className="mt-3" onClick={() => setSheet('handover')}>
          Hand over to next shift
        </Button>
      )}

      {sheet === 'fitter' && <FitterSheet t={t} user={user} onClose={() => setSheet(null)} />}
      {sheet === 'fixed' && <FixedSheet t={t} user={user} onClose={() => setSheet(null)} />}
      {sheet === 'handover' && <HandoverSheet t={t} user={user} onClose={() => setSheet(null)} />}
      {sheet === 'part' && <PartSheet t={t} user={user} onClose={() => setSheet(null)} />}
    </Page>
  );
}

function FitterSheet({ t, user, onClose }: { t: Ticket; user: User; onClose: () => void }) {
  const s = useMillState();
  const now = useNow();
  const dispatch = useDispatch();
  const fitters = s.users.filter((u) => u.role === 'fitter' && u.shift === shiftAt(now));
  const busy = (id: string) => s.tickets.filter((x) => x.fitterId === id && x.status === 'working' && !x.repairDoneAt).length;
  const [pick, setPick] = useState(fitters[0]?.id);
  return (
    <Sheet title={`Send ${frameWord(t.frameId)} to a fitter`} onClose={onClose}>
      <div role="radiogroup" aria-label="Fitter on shift" className="flex flex-col gap-2">
        {fitters.map((f) => (
          <Choice key={f.id} selected={pick === f.id} onClick={() => setPick(f.id)} className="flex justify-between">
            <span>{f.name}</span>
            <span className="t-small text-muted">{busy(f.id) ? `${busy(f.id)} job open` : 'Free'}</span>
          </Choice>
        ))}
      </div>
      <Button
        size="lg"
        block
        className="mt-5"
        disabled={!pick}
        onClick={() => {
          dispatch({ type: 'ticket/assignFitter', ticketId: t.id, fitterId: pick!, by: user.id });
          onClose();
        }}
      >
        Send repair job
      </Button>
    </Sheet>
  );
}

function PhotoInput({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  return (
    <div>
      <label className="t-small-strong flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong text-ink hover:bg-sunken">
        <Camera size={20} />
        {value ? 'Replace photo' : 'Add photo'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onChange(await readPhoto(f));
          }}
        />
      </label>
      {value && <img src={value} alt="Photo to attach" className="mt-2 max-h-40 rounded-[10px] border border-line" />}
    </div>
  );
}

function FixedSheet({ t, user, onClose }: { t: Ticket; user: User; onClose: () => void }) {
  const dispatch = useDispatch();
  const [cause, setCause] = useState<string>();
  const [part, setPart] = useState<string>();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  return (
    <Sheet title={`${frameWord(t.frameId)} fixed: what happened?`} onClose={onClose}>
      <p className="t-small-strong mb-2 text-muted">Which part of the machine needed fixing?</p>
      <div role="radiogroup" aria-label="Machine part" className="mb-5 grid grid-cols-2 gap-2">
        {MACHINE_PARTS.map((p) => (
          <Choice key={p} selected={part === p} onClick={() => setPart(p)}>
            {p}
          </Choice>
        ))}
      </div>
      <p className="t-small-strong mb-2 text-muted">What caused it?</p>
      <div role="radiogroup" aria-label="Cause" className="grid grid-cols-1 gap-2">
        {CAUSES.map((c) => (
          <Choice key={c} selected={cause === c} onClick={() => setCause(c)}>
            <span className="block">{c}</span>
            <span className="t-small text-muted">{CAUSE_HINT[c]}</span>
          </Choice>
        ))}
      </div>
      <p className="t-small mt-3 text-muted">The report goes to the dashboard. The lab re-tests the frame, and the ticket closes when the re-test passes.</p>
      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="fix-note" className="t-small-strong text-muted">
          Note (optional)
        </label>
        <textarea
          id="fix-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reset back roller setting, checked 3 cops"
          className="rounded-[10px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
        />
      </div>
      <div className="mt-4">
        <PhotoInput value={photo} onChange={setPhoto} />
      </div>
      <Button
        size="lg"
        block
        className="mt-5"
        disabled={!cause || !part}
        onClick={() => {
          dispatch({ type: 'ticket/fixed', ticketId: t.id, cause: cause!, part, note: note.trim() || undefined, photo, by: user.id });
          onClose();
        }}
      >
        Send fix report
      </Button>
      {(!cause || !part) && <p className="t-small mt-2 text-center text-muted">Pick the part and the cause to send the report</p>}
    </Sheet>
  );
}

const PARTS_LIST = ['Top roller cots', 'Aprons', 'Travellers', 'Spindle bearing', 'Drafting gear', 'Something else'];

function PartSheet({ t, user, onClose }: { t: Ticket; user: User; onClose: () => void }) {
  const dispatch = useDispatch();
  const [part, setPart] = useState<string>();
  return (
    <Sheet title="Waiting for a spare part" onClose={onClose}>
      <p className="t-small text-muted">The ticket stays open and the dashboard shows the wait, so nobody chases you for it. Tap Part arrived when it comes.</p>
      <div role="radiogroup" aria-label="Part" className="mt-4 grid grid-cols-2 gap-2">
        {PARTS_LIST.map((p) => (
          <Choice key={p} selected={part === p} onClick={() => setPart(p)}>
            {p}
          </Choice>
        ))}
      </div>
      <Button
        size="lg"
        block
        className="mt-5"
        disabled={!part}
        onClick={() => {
          dispatch({ type: 'ticket/waitPart', ticketId: t.id, part: part!, by: user.id });
          onClose();
        }}
      >
        Mark as waiting
      </Button>
    </Sheet>
  );
}

function HandoverSheet({ t, user, onClose }: { t: Ticket; user: User; onClose: () => void }) {
  const dispatch = useDispatch();
  const [note, setNote] = useState('');
  return (
    <Sheet title="Hand over to next shift" onClose={onClose}>
      <p className="t-small text-muted">The next supervisor gets this ticket with your note. If you skip this, it moves over at shift change anyway.</p>
      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="ho-note" className="t-small-strong text-muted">
          What should they know?
        </label>
        <textarea
          id="ho-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Fitter changed the top apron, check 2 cops after the next doff"
          className="rounded-[10px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
        />
      </div>
      <Button
        size="lg"
        block
        className="mt-5"
        disabled={!note.trim()}
        onClick={() => {
          dispatch({ type: 'ticket/handover', ticketId: t.id, note: note.trim(), by: user.id });
          onClose();
        }}
      >
        Hand over ticket
      </Button>
    </Sheet>
  );
}

// ================= Lab: enter result =================
export function TestEntryScreen() {
  const { id } = useParams();
  const s = useMillState();
  const now = useNow();
  const user = useUser('app');
  const dispatch = useDispatch();
  const nav = useNavigate();
  const req = s.requests.find((r) => r.id === id);
  const [raw, setRaw] = useState('');
  const [saved, setSaved] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  if (!req) return <Page title="Request not found" back="/app">{null}</Page>;
  const product = productOfFrame(s, req.frameId);
  const rule = ruleFor(s, product.id, req.test);
  const value = raw.trim() === '' ? undefined : Number(raw.replace(',', '.'));
  const invalid = value !== undefined && (Number.isNaN(value) || value <= 0);
  const result = saved ? s.results.find((r) => r.id === saved) : undefined;

  if (result) {
    const t = s.tickets.find((x) => x.readings.some((r) => r.resultId === result.id));
    const hold = t?.holdId ? s.holds.find((h) => h.id === t.holdId) : undefined;
    return (
      <Page title={result.pass ? 'Within limit' : 'Outside the limit'} back="/app">
        <div className={cx('rounded-[10px] p-4', result.pass ? 'bg-ok-soft' : 'bg-critical-soft')}>
          <p className={cx('t-body-strong', result.pass ? 'text-ok' : 'text-critical')}>
            {withUnit(result.test, result.value)} on {frameWord(result.frameId)}
          </p>
          <p className="t-small mt-1 text-ink">Saved at {hhmm(result.at)} by {first(user)}</p>
        </div>
        <h2 className="t-small-strong mt-5 text-muted">What the system did</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {result.pass ? (
            <li className="t-body">
              {req.reason === 'retest' ? 'Fix confirmed. The QC manager can decide on the held yarn.' : 'Recorded the result'}
            </li>
          ) : (
            <>
              {req.reason === 'retest' ? (
                <li className="t-body">Ticket sent back to the supervisor. The yarn stays on hold.</li>
              ) : (
                <>
                  <li className="t-body">Alert sent to the {shiftAt(now)} shift supervisor{t?.severity === 'critical' ? ' with sound' : ''}</li>
                  {hold && <li className="t-body">{frameWord(result.frameId)} yarn since {hhmm(hold.from)} put on hold</li>}
                  {t && t.sisterFrames.length > 0 && <li className="t-body">Sister frames {t.sisterFrames.map((f) => Number(f.slice(3))).join(' and ')} added to your list</li>}
                </>
              )}
            </>
          )}
        </ul>
        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" block onClick={() => nav('/app')}>
            Back to test requests
          </Button>
          {!result.pass && !result.sampleError && req.reason !== 'retest' && (
            <Button
              size="lg"
              block
              variant="ghost"
              onClick={() => dispatch({ type: 'result/sampleError', resultId: result.id, by: user.id })}
            >
              Mark as sample error
            </Button>
          )}
          {result.sampleError && <p className="t-small text-center text-muted">Marked as sample error. Hold released, ticket closed as a false alarm.</p>}
        </div>
      </Page>
    );
  }

  return (
    <Page title={`${TEST[req.test].name} test, ${frameWord(req.frameId)}`} sub={`${REASON[req.reason]} · Lot ${lotOf(s, s.frames.find((f) => f.id === req.frameId)!.lotId).id} · ${product.name}`} back="/app">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (value === undefined || invalid || (user.role !== 'tester' && user.role !== 'qc')) return;
          if (!withinRule(rule, value) && req.reason !== 'retest' && !confirm) {
            setConfirm(true);
            return;
          }
          const ev = dispatch({ type: 'result/enter', frameId: req.frameId, test: req.test, value, requestId: req.id, by: user.id });
          const r = useMillStateSnapshot().results.findLast((x) => x.requestId === req.id && x.at === ev.at);
          setSaved(r?.id);
        }}
      >
        <p className="t-small rounded-[10px] bg-sunken px-3 py-2.5 text-ink">Instrument: {TEST[req.test].instrument}</p>
        <TextField
          big
          label={`Reading (${TEST[req.test].unit || 'value'})`}
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setConfirm(false);
          }}
          unit={TEST[req.test].unit}
          error={invalid ? 'Enter a number, like 29.8' : undefined}
          hint={rule ? `Limit for ${product.short}: ${rule.min ?? '–'} to ${rule.max ?? '–'}` : undefined}
        />
        <div className="rounded-[10px] border border-line bg-raised p-4">
          <ReadingGauge test={req.test} value={invalid ? undefined : value} min={rule?.min} max={rule?.max} pending />
          {value !== undefined && !invalid && !withinRule(rule, value) && req.reason !== 'retest' && (
            <p className="t-small mt-3 text-critical">Saving this alerts the supervisor{rule?.severity === 'critical' ? ' and holds the yarn' : ''}.</p>
          )}
        </div>
        {confirm && value !== undefined ? (
          <div className="anim-fade flex flex-col gap-3 rounded-[10px] border border-critical bg-critical-soft p-4" role="alertdialog" aria-label="Check the reading">
            <p className="t-body-strong text-ink">
              Is {value} {TEST[req.test].unit} right?
            </p>
            <p className="t-small text-ink">
              It is outside {rule?.min ?? '–'} to {rule?.max ?? '–'}. Saving it {rule?.severity === 'critical' ? 'rings the supervisor and holds the yarn' : 'alerts the supervisor'}. Read the instrument once more before you save.
            </p>
            <Button size="lg" block type="submit" variant="danger">
              Yes, save {value} {TEST[req.test].unit}
            </Button>
            <Button size="lg" block type="button" variant="ghost" onClick={() => setConfirm(false)}>
              Change the reading
            </Button>
          </div>
        ) : (
          <Button size="lg" block type="submit" disabled={value === undefined || invalid || (user.role !== 'tester' && user.role !== 'qc')}>
            Save result
          </Button>
        )}
        {user.role !== 'tester' && user.role !== 'qc' && <p className="t-small text-center text-muted">Only the lab tester and the QC manager enter results.</p>}
      </form>
    </Page>
  );
}

const useMillStateSnapshot = () => useMill.getState().state;

// ================= Raise ticket =================
export function RaiseScreen() {
  const s = useMillState();
  const user = useUser('app');
  const dispatch = useDispatch();
  const nav = useNavigate();
  const [frame, setFrame] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [severity, setSeverity] = useState<Severity>('major');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  const suggest = (p: string): Severity => (p.includes('thick') || p.includes('Wrong roving') ? 'critical' : p.includes('noise') || p.includes('Something') ? 'minor' : 'major');
  return (
    <Page title="Raise ticket" sub="Report a problem you saw on the floor">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!frame || !problem) return;
          dispatch({ type: 'ticket/raise', frameId: frame, problem, severity, note: note.trim() || undefined, photo, by: user.id });
          const t = useMill.getState().state.tickets.at(-1)!;
          nav(`/app/ticket/${t.id}`);
        }}
      >
        <Field label="Which frame?">
          <div role="radiogroup" aria-label="Frame" className="grid grid-cols-6 gap-1.5">
            {s.frames.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={frame === f.id}
                aria-label={f.id}
                onClick={() => setFrame(f.id)}
                className={cx(
                  't-data h-12 rounded-[10px] border text-[15px]',
                  frame === f.id ? 'border-brand bg-brand-soft font-semibold outline outline-1 outline-brand' : 'border-line-strong bg-raised hover:bg-sunken',
                )}
              >
                {f.num}
              </button>
            ))}
          </div>
        </Field>
        <Field label="What’s wrong?">
          <div role="radiogroup" aria-label="Problem" className="flex flex-col gap-2">
            {RAISE_PROBLEMS.map((p) => (
              <Choice
                key={p}
                selected={problem === p}
                onClick={() => {
                  setProblem(p);
                  setSeverity(suggest(p));
                }}
              >
                {p}
              </Choice>
            ))}
          </div>
        </Field>
        {problem && (
          <Field label="How serious? (suggested)">
            <div role="radiogroup" aria-label="Severity" className="grid grid-cols-3 gap-2">
              {(['critical', 'major', 'minor'] as Severity[]).map((v) => (
                <Choice key={v} selected={severity === v} onClick={() => setSeverity(v)} className="flex items-center justify-center gap-1.5">
                  <SeverityShape level={v} />
                  {v[0].toUpperCase() + v.slice(1)}
                </Choice>
              ))}
            </div>
          </Field>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="raise-note" className="t-small-strong text-muted">
            Note (optional)
          </label>
          <textarea
            id="raise-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Breaks on spindles 210 to 240"
            className="rounded-[10px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
          />
        </div>
        <PhotoInput value={photo} onChange={setPhoto} />
        <Button size="lg" block type="submit" disabled={!frame || !problem}>
          Raise ticket
        </Button>
        {user.role !== 'supervisor' && <p className="t-small -mt-3 text-center text-muted">Goes straight to the {shiftAtNow()} shift supervisor.</p>}
      </form>
    </Page>
  );
}
const shiftAtNow = () => shiftAt(useMill.getState().now);

// ================= History =================
export function PreviousScreen() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('app');
  const nav = useNavigate();
  const [cause, setCause] = useState<string>('all');
  const [frame, setFrame] = useState<string>('all');
  const past = useMemo(
    () =>
      s.tickets
        .filter((t) => (t.status === 'closed' || t.status === 'fixed') && t.createdAt <= now && now - t.createdAt < 31 * 86_400_000)
        .filter((t) => {
          if (user.role === 'fitter') return t.fitterId === user.id;
          if (user.role === 'tester') return s.requests.some((r) => r.ticketId === t.id && s.results.some((x) => x.id === r.resultId && x.by === user.id));
          return true;
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [s.tickets, s.requests, s.results, now, user.id, user.role],
  );
  const mine = past.filter((t) => t.seenBy === user.id);
  const myMedian = median(seenTimes(mine));
  const list = past.filter((t) => (cause === 'all' || t.cause === cause) && (frame === 'all' || t.frameId === frame));
  const groups: { day: string; items: Ticket[] }[] = [];
  for (const t of list) {
    const d = dayMonth(t.createdAt);
    if (groups.at(-1)?.day !== d) groups.push({ day: d, items: [] });
    groups.at(-1)!.items.push(t);
  }
  const select = 'h-12 rounded-[10px] border border-line-strong bg-raised px-2 t-small';
  return (
    <Page title="History" sub={`${user.role === 'fitter' ? 'Frames you repaired' : user.role === 'tester' ? 'Issues you tested' : 'Resolved issues'}, last 31 days · ${monthName(now)}`}>
      {user.role === 'supervisor' && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-[16px] bg-raised p-3 shadow-raised">
            <p className="t-small text-muted">Your median time to “I’m fixing”</p>
            <p className="t-stat">{myMedian ? timer(myMedian) : '–'}</p>
          </div>
          <div className="rounded-[16px] bg-raised p-3 shadow-raised">
            <p className="t-small text-muted">Issues you handled</p>
            <p className="t-stat">{mine.length}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Frame" className={select} value={frame} onChange={(e) => setFrame(e.target.value)}>
          <option value="all">All frames</option>
          {s.frames.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id}
            </option>
          ))}
        </select>
        <select aria-label="Cause" className={select} value={cause} onChange={(e) => setCause(e.target.value)}>
          <option value="all">Any cause</option>
          {CAUSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {groups.length === 0 && <p className="t-small mt-6 text-center text-muted">Nothing resolved matches these filters.</p>}
      {groups.map((g) => (
        <section key={g.day} className="mt-5">
          <h2 className="t-small-strong mb-2 text-muted">{g.day}</h2>
          <ul className="overflow-hidden rounded-[16px] bg-raised shadow-raised">
            {g.items.map((t, i) => (
              <li key={t.id} className={cx(i > 0 && 'border-t border-line')}>
                <button type="button" onClick={() => nav(`/app/ticket/${t.id}`)} className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken">
                  <span className={cx('grid size-8 shrink-0 place-items-center rounded-full', t.status === 'fixed' ? 'bg-held-soft text-held' : 'bg-ok-soft text-ok')}>
                    {t.status === 'fixed' ? <SeverityShape level={t.severity} /> : <Checkmark size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-small-strong block truncate">
                      {frameWord(t.frameId)} · {t.kind === 'drift' ? 'Winding drift' : t.title}
                    </span>
                    <span className="t-small block truncate text-muted">
                      {t.status === 'fixed' ? 'Fixed, yarn waiting for QC' : t.closeReason === 'sample_error' ? 'False alarm' : t.closeReason === 'checked_ok' ? 'Checked, OK' : t.cause ?? 'Resolved'}
                    </span>
                  </span>
                  <span className="t-data text-[13px] text-muted">{hhmm(t.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}

// ================= Lab: report a failed test =================
export function FailScreen() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('app');
  const dispatch = useDispatch();
  const nav = useNavigate();
  const [frameId, setFrameId] = useState<string>();
  const [test, setTest] = useState<TestKind>('count');
  const [raw, setRaw] = useState('');
  const frame = frameId ? s.frames.find((f) => f.id === frameId) : undefined;
  const product = frame ? productOfFrame(s, frame.id) : undefined;
  const rule = product ? ruleFor(s, product.id, test) : undefined;
  const value = raw.trim() === '' ? undefined : Number(raw.replace(',', '.'));
  const invalid = value !== undefined && (Number.isNaN(value) || value <= 0);
  const inside = value !== undefined && !invalid && withinRule(rule, value);
  const allowed = user.role === 'tester' || user.role === 'qc';
  const ready = !!frame && value !== undefined && !invalid && !inside && allowed;
  const sup = frame ? supervisorFor(s, frame.id, now) : undefined;

  return (
    <Page title="Report a failed test" sub="Frame and lot are on the sample label" back="/app">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          dispatch({ type: 'result/enter', frameId: frame!.id, test, value: value!, by: user.id });
          const t = useMill.getState().state.tickets.filter((x) => x.frameId === frame!.id && x.status !== 'closed').at(-1);
          nav(t ? `/app/ticket/${t.id}` : '/app');
        }}
      >
        <Field label="Frame">
          <div role="radiogroup" aria-label="Frame" className="grid grid-cols-6 gap-1.5">
            {s.frames.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={frameId === f.id}
                aria-label={f.id}
                onClick={() => setFrameId(f.id)}
                className={cx('t-data h-12 rounded-[8px] border text-[15px]', frameId === f.id ? 'border-ink bg-ink text-[var(--surface-raised)]' : 'border-line-strong bg-raised hover:bg-sunken')}
              >
                {f.num}
              </button>
            ))}
          </div>
        </Field>
        {frame && product && (
          <p className="t-small -mt-2 rounded-[10px] bg-sunken px-3 py-2.5 text-ink">
            Lot <span className="t-data">{frame.lotId}</span> · {product.name}. Check it matches the label.
          </p>
        )}
        <Field label="Which test">
          <div role="radiogroup" aria-label="Test" className="grid grid-cols-2 gap-2">
            {(['count', 'csp', 'twist', 'cv'] as TestKind[]).map((k) => (
              <Choice key={k} selected={test === k} onClick={() => setTest(k)}>
                {TEST[k].name}
              </Choice>
            ))}
          </div>
        </Field>
        <TextField
          big
          label={`Reading${TEST[test].unit ? ` (${TEST[test].unit})` : ''}`}
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          unit={TEST[test].unit}
          error={invalid ? 'Enter a number, like 28.9' : undefined}
        />
        {rule && (
          <div className="-mt-2 rounded-[10px] border border-line bg-raised p-4">
            <ReadingGauge test={test} value={invalid ? undefined : value} min={rule.min} max={rule.max} pending />
            {inside && <p className="t-small mt-3 text-ok">This is inside the limit. Only report readings outside it.</p>}
          </div>
        )}
        <Button size="lg" block type="submit" variant="danger" disabled={!ready}>
          Report failed test
        </Button>
        <p className="t-small -mt-3 text-center text-muted">
          {!allowed ? 'Only the lab tester and the QC manager report results.' : sup ? `${sup.name} (supervisor) is alerted at once.` : 'The shift supervisor is alerted at once.'}
        </p>
      </form>
    </Page>
  );
}
