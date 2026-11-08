import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Checkmark, ChevronRight } from '@carbon/icons-react';
import type { MillState, Severity, Ticket, User } from '../engine/types';
import { useDispatch, useMill, useMillState, useNow, useUser } from '../store/store';
import { escalation, fitterJobs, median, myTickets, pendingRequests, seenTimes } from '../engine/selectors';
import { frameWord, holdKg, lotOf, productOfFrame, roundKg, ruleFor, userName, withinRule, withUnit } from '../engine/reducer';
import { CAUSES, RAISE_PROBLEMS, TEST } from '../engine/vocab';
import { ago, dayMonth, hhmm, monthName, shiftAt, timer } from '../engine/time';
import { Button, Choice, cx, Empty, Field, SeverityBadge, SeverityShape, StatusChip, TextField } from '../ui/primitives';
import { ReadingGauge, ResponseTimer, TicketCard, ticketChip, ticketMeta } from '../ui/cards';
import { Timeline } from '../ui/timeline';
import { readPhoto, Sheet } from './Sheet';

function Page({ title, sub, back, children }: { title: string; sub?: string; back?: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-8">
      {back && (
        <Link to={back} className="t-small-strong -ml-2 mb-2 inline-flex h-12 items-center gap-1 rounded-[4px] px-2 text-brand hover:bg-brand-soft">
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
  return <MyTickets user={user} />;
}

function MyTickets({ user }: { user: User }) {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const list = myTickets(s, user, now);
  const live = list.filter((t) => t.status !== 'fixed');
  const waiting = list.filter((t) => t.status === 'fixed');
  const onShift = user.shift === 'G' || user.shift === shiftAt(now);
  const sub =
    user.role === 'supervisor'
      ? `${user.shift} shift · ${first(user)} · ${live.length} open${onShift ? '' : ' · off shift'}`
      : `${first(user)} · ${user.role === 'qc' ? 'escalations and held yarn' : 'escalations only'}`;
  return (
    <Page title="My tickets" sub={sub}>
      {list.length === 0 ? (
        <Empty
          icon={<Checkmark size={32} />}
          title="No open tickets"
          body={user.role === 'supervisor' ? 'All frames are running normally. New faults will ring this phone.' : 'Nothing has been escalated to you.'}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {live.map((t) => (
            <TicketCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/app/ticket/${t.id}`)} />
          ))}
          {waiting.length > 0 && <p className="t-small-strong mt-3 text-muted">Fixed, yarn waiting for QC decision</p>}
          {waiting.map((t) => (
            <TicketCard key={t.id} s={s} t={t} now={now} onOpen={() => nav(`/app/ticket/${t.id}`)} />
          ))}
        </div>
      )}
    </Page>
  );
}

const REASON: Record<string, string> = {
  drift: 'Winding sensor drift',
  sister: 'Sister frame check',
  retest: 'Re-test of held yarn',
  manual: 'Asked by QC',
};

function TestRequests({ user }: { user: User }) {
  const s = useMillState();
  const now = useNow();
  const list = pendingRequests(s);
  return (
    <Page title="Test requests" sub={`${user.shift} shift lab · ${first(user)} · ${list.length} waiting`}>
      {list.length === 0 ? (
        <Empty icon={<Checkmark size={32} />} title="No urgent tests" body="Routine tests continue every 8 hours. Urgent requests appear here first." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => {
            const product = productOfFrame(s, r.frameId);
            const late = now > r.dueAt;
            return (
              <li key={r.id}>
                <Link
                  to={`/app/test/${r.id}`}
                  className={cx('flex items-center gap-3 rounded-[4px] border bg-raised p-4 shadow-raised hover:bg-sunken', r.urgent ? 'border-major-fill' : 'border-line')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {r.urgent && (
                        <span className="t-label inline-flex h-6 items-center gap-1.5 rounded-[2px] bg-major-soft px-2 text-major">
                          <SeverityShape level="major" /> Urgent
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
  const dispatch = useDispatch();
  const jobs = fitterJobs(s, user.id);
  return (
    <Page title="Repair jobs" sub={`${user.shift} shift · ${first(user)} · ${jobs.length} open`}>
      {jobs.length === 0 ? (
        <Empty icon={<Checkmark size={32} />} title="No repair jobs" body="When a supervisor sends you a frame, it shows up here with what failed." />
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((t) => (
            <li key={t.id} className="rounded-[4px] border border-line bg-raised p-4 shadow-raised">
              <div className="flex items-center justify-between">
                <SeverityBadge level={t.severity} />
                <span className="t-data text-[13px] text-muted">sent {ago(now - (t.events.findLast((e) => e.kind === 'fitter_assigned')?.at ?? now))} ago</span>
              </div>
              <p className="t-section mt-3">{frameWord(t.frameId)}</p>
              <p className="t-body">{t.title}</p>
              <p className="t-small mt-1 text-muted">
                {ticketMeta(s, t)} · from {userName(s, t.seenBy)}
              </p>
              <Button size="lg" block className="mt-4" onClick={() => dispatch({ type: 'ticket/repairDone', ticketId: t.id, by: user.id })}>
                Mark repair done
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
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

function TicketDetail({ s, t, now, user }: { s: MillState; t: Ticket; now: number; user: User }) {
  const dispatch = useDispatch();
  const [sheet, setSheet] = useState<'fitter' | 'fixed' | 'handover' | null>(null);
  const esc = escalation(t, now);
  const reading = t.readings.at(-1);
  const rule = reading && t.kind === 'test_fail' ? ruleFor(s, t.productId, reading.test) : undefined;
  const hold = t.holdId ? s.holds.find((h) => h.id === t.holdId) : undefined;
  const canAct = user.role === 'supervisor' || user.role === 'qc';
  const fitter = t.fitterId ? userName(s, t.fitterId) : undefined;

  let action: ReactNode = null;
  if (canAct && t.status === 'open')
    action = (
      <Button size="lg" block variant={t.severity === 'critical' ? 'danger' : 'primary'} onClick={() => dispatch({ type: 'ticket/seen', ticketId: t.id, by: user.id })}>
        Seen, I’m on it
      </Button>
    );
  else if (canAct && t.status === 'seen')
    action = (
      <Button size="lg" block onClick={() => dispatch({ type: 'ticket/working', ticketId: t.id, by: user.id })}>
        Start work on {frameWord(t.frameId)}
      </Button>
    );
  else if (canAct && t.status === 'working' && !t.fitterId)
    action = (
      <div className="flex flex-col gap-2">
        <Button size="lg" block onClick={() => setSheet('fitter')}>
          Send to a fitter
        </Button>
        <Button size="lg" block variant="secondary" onClick={() => setSheet('fixed')}>
          Mark fixed
        </Button>
      </div>
    );
  else if (canAct && t.status === 'working')
    action = (
      <div className="flex flex-col gap-2">
        {!t.repairDoneAt && (
          <p className="t-small flex items-center gap-2 rounded-[4px] bg-major-soft px-3 py-2.5 text-ink">
            <span className="t-small-strong">{fitter}</span> is repairing the frame
          </p>
        )}
        <Button size="lg" block variant={t.repairDoneAt ? 'primary' : 'secondary'} onClick={() => setSheet('fixed')}>
          Mark fixed
        </Button>
      </div>
    );

  return (
    <Page title={t.title} back="/app">
      <div className="-mt-1 flex flex-wrap items-center gap-2">
        <SeverityBadge level={t.severity} />
        <StatusChip kind={ticketChip(t, now)} />
        <span className="t-data text-[13px] text-muted">{t.id}</span>
      </div>
      <p className="t-small mt-2 text-muted">
        {frameWord(t.frameId)} · Lot {t.lotId} · {s.products.find((p) => p.id === t.productId)!.name}
      </p>

      {reading && (
        <section className="mt-4 rounded-[4px] border border-line bg-raised p-4">
          <ReadingGauge test={reading.test} value={reading.value} min={rule?.min} max={t.kind === 'test_fail' ? rule?.max : reading.max} drift={t.kind !== 'test_fail' && reading.test === 'cv'} />
          {t.readings.length > 1 && <p className="t-small mt-3 text-muted">{t.readings.length} readings grouped on this ticket</p>}
        </section>
      )}

      {(t.status === 'open' || (t.seenAt && t.severity !== 'minor')) && t.status !== 'closed' && (
        <section className="mt-4">
          <ResponseTimer elapsed={esc.elapsed} limitMins={t.seenMins} state={esc.timer} level={esc.level} frozen={!!t.seenAt} />
        </section>
      )}

      {hold && (
        <section className="mt-4 flex items-center justify-between rounded-[4px] bg-held-soft px-4 py-3">
          <div>
            <p className="t-small-strong text-held">Yarn on hold since {hhmm(hold.from)}</p>
            <p className="t-small text-ink">{hold.status === 'on_hold' ? (hold.to ? 'Waiting for the QC manager' : 'Grows until the frame is fixed') : `Decided: ${hold.status}`}</p>
          </div>
          <span className="t-stat text-held">
            {roundKg(holdKg(hold, now))}
            <span className="t-small ml-1">kg</span>
          </span>
        </section>
      )}

      {action && <div className="mt-5">{action}</div>}

      {t.status === 'fixed' && (
        <p className="t-small mt-5 rounded-[4px] bg-ok-soft px-3 py-2.5 text-ink">
          Fixed: {t.cause?.toLowerCase()}. The QC manager decides on the held yarn, then this ticket closes.
        </p>
      )}

      <h2 className="t-section mt-7 mb-3">What happened</h2>
      <Timeline s={s} t={t} now={now} />

      {t.photo && <img src={t.photo} alt={`Photo added when ${frameWord(t.frameId)} was fixed`} className="mt-2 w-full rounded-[4px] border border-line" />}

      {canAct && t.status !== 'closed' && t.status !== 'fixed' && (
        <Button variant="ghost" block className="mt-4" onClick={() => setSheet('handover')}>
          Hand over to next shift
        </Button>
      )}

      {sheet === 'fitter' && <FitterSheet t={t} user={user} onClose={() => setSheet(null)} />}
      {sheet === 'fixed' && <FixedSheet t={t} user={user} onClose={() => setSheet(null)} />}
      {sheet === 'handover' && <HandoverSheet t={t} user={user} onClose={() => setSheet(null)} />}
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
      <label className="t-small-strong flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-dashed border-line-strong text-ink hover:bg-sunken">
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
      {value && <img src={value} alt="Photo to attach" className="mt-2 max-h-40 rounded-[4px] border border-line" />}
    </div>
  );
}

function FixedSheet({ t, user, onClose }: { t: Ticket; user: User; onClose: () => void }) {
  const dispatch = useDispatch();
  const [cause, setCause] = useState<string>();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  return (
    <Sheet title={`Mark ${frameWord(t.frameId)} fixed`} onClose={onClose}>
      <p className="t-small-strong mb-2 text-muted">What caused it?</p>
      <div role="radiogroup" aria-label="Cause" className="grid grid-cols-1 gap-2">
        {CAUSES.map((c) => (
          <Choice key={c} selected={cause === c} onClick={() => setCause(c)}>
            {c}
          </Choice>
        ))}
      </div>
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
          className="rounded-[4px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
        />
      </div>
      <div className="mt-4">
        <PhotoInput value={photo} onChange={setPhoto} />
      </div>
      <Button
        size="lg"
        block
        className="mt-5"
        disabled={!cause}
        onClick={() => {
          dispatch({ type: 'ticket/fixed', ticketId: t.id, cause: cause!, note: note.trim() || undefined, photo, by: user.id });
          onClose();
        }}
      >
        Mark fixed
      </Button>
      {!cause && <p className="t-small mt-2 text-center text-muted">Pick a cause to continue</p>}
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
          className="rounded-[4px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
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
  const req = s.requests.find((r) => r.id === id);
  const [raw, setRaw] = useState('');
  const [saved, setSaved] = useState<string>();
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
        <div className={cx('rounded-[4px] p-4', result.pass ? 'bg-ok-soft' : 'bg-critical-soft')}>
          <p className={cx('t-body-strong', result.pass ? 'text-ok' : 'text-critical')}>
            {withUnit(result.test, result.value)} on {frameWord(result.frameId)}
          </p>
          <p className="t-small mt-1 text-ink">Saved at {hhmm(result.at)} by {first(user)}</p>
        </div>
        <h2 className="t-small-strong mt-5 text-muted">What the system did</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {result.pass ? (
            <li className="t-body">
              {req.reason === 'drift' ? 'Closed the drift ticket as checked, OK' : req.reason === 'retest' ? 'Told the QC manager the re-test passed' : 'Recorded the result'}
            </li>
          ) : (
            <>
              {req.reason === 'retest' ? (
                <li className="t-body">Yarn stays on hold. The QC manager decides next.</li>
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
          <Button size="lg" block onClick={() => history.back()}>
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
          if (value === undefined || invalid || user.role !== 'tester') return;
          const ev = dispatch({ type: 'result/enter', frameId: req.frameId, test: req.test, value, requestId: req.id, by: user.id });
          const r = useMillStateSnapshot().results.findLast((x) => x.requestId === req.id && x.at === ev.at);
          setSaved(r?.id);
        }}
      >
        <p className="t-small rounded-[4px] bg-sunken px-3 py-2.5 text-ink">Instrument: {TEST[req.test].instrument}</p>
        <TextField
          big
          label={`Reading (${TEST[req.test].unit || 'value'})`}
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          unit={TEST[req.test].unit}
          error={invalid ? 'Enter a number, like 29.8' : undefined}
          hint={rule ? `Limit for ${product.short}: ${rule.min ?? '–'} to ${rule.max ?? '–'}` : undefined}
        />
        <div className="rounded-[4px] border border-line bg-raised p-4">
          <ReadingGauge test={req.test} value={invalid ? undefined : value} min={rule?.min} max={rule?.max} pending />
          {value !== undefined && !invalid && !withinRule(rule, value) && req.reason !== 'retest' && (
            <p className="t-small mt-3 text-critical">Saving this alerts the supervisor{rule?.severity === 'critical' ? ' and holds the yarn' : ''}.</p>
          )}
        </div>
        <Button size="lg" block type="submit" disabled={value === undefined || invalid || user.role !== 'tester'}>
          Save result
        </Button>
        {user.role !== 'tester' && <p className="t-small text-center text-muted">Only the lab tester enters results.</p>}
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
                  't-data h-12 rounded-[4px] border text-[15px]',
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
            className="rounded-[4px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
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

// ================= Previous =================
export function PreviousScreen() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('app');
  const nav = useNavigate();
  const [status, setStatus] = useState<'all' | 'closed' | 'open'>('all');
  const [cause, setCause] = useState<string>('all');
  const [frame, setFrame] = useState<string>('all');
  const month = useMemo(
    () => s.tickets.filter((t) => t.createdAt <= now && now - t.createdAt < 31 * 86_400_000).sort((a, b) => b.createdAt - a.createdAt),
    [s.tickets, now],
  );
  const mine = month.filter((t) => t.seenBy === user.id);
  const myMedian = median(seenTimes(mine));
  const list = month.filter(
    (t) =>
      (status === 'all' || (status === 'closed' ? t.status === 'closed' : t.status !== 'closed')) &&
      (cause === 'all' || t.cause === cause) &&
      (frame === 'all' || t.frameId === frame),
  );
  const select = 'h-12 rounded-[4px] border border-line-strong bg-raised px-2 t-small';
  return (
    <Page title="Previous" sub={`Last 31 days · ${monthName(now)}`}>
      {user.role === 'supervisor' && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-[4px] border border-line bg-raised p-3">
            <p className="t-small text-muted">Your median to Seen</p>
            <p className="t-stat">{myMedian ? timer(myMedian) : '–'}</p>
          </div>
          <div className="rounded-[4px] border border-line bg-raised p-3">
            <p className="t-small text-muted">Tickets you saw</p>
            <p className="t-stat">{mine.length}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value as never)}>
          <option value="all">Any status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
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
      <ul className="mt-4 divide-y divide-[var(--line)] rounded-[4px] border border-line bg-raised">
        {list.length === 0 && <li className="t-small p-4 text-muted">No tickets match these filters.</li>}
        {list.slice(0, 60).map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => nav(`/app/ticket/${t.id}`)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken">
              <SeverityShape level={t.severity} size={12} />
              <span className="min-w-0 flex-1">
                <span className="t-small-strong block truncate">
                  {t.frameId} · {t.title}
                </span>
                <span className="t-small block truncate text-muted">
                  {dayMonth(t.createdAt)} · {t.closeReason === 'sample_error' ? 'False alarm' : t.closeReason === 'checked_ok' ? 'Checked, OK' : t.cause ?? 'No cause yet'}
                </span>
              </span>
              <StatusChip kind={ticketChip(t, now)} />
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

