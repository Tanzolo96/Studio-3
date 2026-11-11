import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Checkmark, ChevronRight } from '@carbon/icons-react';
import type { MillState, Severity, Ticket, User } from '../engine/types';
import { useDispatch, useMill, useMillState, useNow, useUser } from '../store/store';
import { escalation, fitterJobs, median, myTickets, pendingRequests, seenTimes, timeline } from '../engine/selectors';
import { failWord, frameWord, holdKg, lotOf, productOfFrame, roundKg, ruleFor, userName, withinRule, withUnit } from '../engine/reducer';
import { CAUSES, RAISE_PROBLEMS, TEST } from '../engine/vocab';
import { ago, dayMonth, hhmm, monthName, shiftAt, timer } from '../engine/time';
import { Button, Choice, cx, Empty, Field, SeverityBadge, SeverityShape, TextField } from '../ui/primitives';
import { ReadingGauge, ResponseTimer, TicketCard, ticketMeta } from '../ui/cards';
import { Timeline } from '../ui/timeline';
import { readPhoto, Sheet } from './Sheet';

function Page({ title, sub, back, children }: { title: string; sub?: string; back?: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-8">
      {back && (
        <Link to={back} className="t-small-strong -ml-2 mb-2 inline-flex h-12 items-center gap-1 rounded-[6px] px-2 text-brand hover:bg-brand-soft">
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
  const live = myTickets(s, user, now).filter((t) => t.status !== 'fixed');
  const onShift = user.shift === 'G' || user.shift === shiftAt(now);
  const sub =
    user.role === 'supervisor'
      ? `${user.shift} shift · ${first(user)}${onShift ? '' : ' · off shift'}`
      : `${first(user)} · ${user.role === 'qc' ? 'escalations and held yarn' : 'escalations only'}`;
  return (
    <Page title="Active issues" sub={sub}>
      {live.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[10px] bg-raised px-6 py-12 text-center shadow-raised">
          <span className="grid size-16 place-items-center rounded-full bg-ok-soft text-ok">
            <Checkmark size={32} />
          </span>
          <p className="t-section">All clear</p>
          <p className="t-small max-w-[30ch] text-muted">
            {user.role === 'supervisor' ? 'No active issues. Every frame is running normally. A new fault will ring this phone.' : 'Nothing has been escalated to you.'}
          </p>
          <Link to="/app/previous" className="t-small-strong mt-1 inline-flex h-12 items-center rounded-[6px] px-3 text-brand hover:bg-brand-soft">
            See resolved issues in History
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="t-small-strong text-muted">
            {live.length} need{live.length === 1 ? 's' : ''} attention
          </p>
          {live.map((t) => (
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
                  className={cx('flex items-center gap-3 rounded-[6px] border bg-raised p-4 shadow-raised hover:bg-sunken', r.urgent ? 'border-major-fill' : 'border-line')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {r.urgent && (
                        <span className="t-label inline-flex h-6 items-center gap-1.5 rounded-[4px] bg-major-soft px-2 text-major">
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
            <li key={t.id} className="rounded-[6px] border border-line bg-raised p-4 shadow-raised">
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
  const canAct = user.role === 'supervisor' || user.role === 'qc' || user.role === 'plant';
  const canAsk = user.role === 'supervisor' || user.role === 'qc';
  const askTest = reading && reading.test !== 'cv' ? reading.test : 'count';
  const pendingAsk = s.requests.find((r) => r.ticketId === t.id && r.status === 'pending');
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
          <p className="t-small flex items-center gap-2 rounded-[6px] bg-major-soft px-3 py-2.5 text-ink">
            <span className="t-small-strong">{fitter}</span> is repairing the frame
          </p>
        )}
        <Button size="lg" block variant={t.repairDoneAt ? 'primary' : 'secondary'} onClick={() => setSheet('fixed')}>
          Mark fixed
        </Button>
      </div>
    );

  const resolved = t.status === 'fixed' || t.status === 'closed';
  const product = s.products.find((p) => p.id === t.productId)!;
  const issue =
    t.kind === 'drift'
      ? 'Winding sensor drift, lab test asked'
      : t.kind === 'manual'
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
          ? `Cause: ${t.cause.toLowerCase()}`
          : '';
  const nowLine =
    t.status === 'open'
      ? esc.level > 0
        ? `Nobody has said Seen for ${Math.floor(esc.elapsed / 60000)} min. ${esc.level === 2 ? 'Plant head told.' : 'QC manager told.'}`
        : 'Waiting for someone to say Seen'
      : t.status === 'seen'
        ? `${userName(s, t.seenBy).split(' ')[0]} is on it`
        : t.status === 'working'
          ? t.fitterId && !t.repairDoneAt
            ? `${fitter?.split(' ')[0]} is repairing the frame`
            : t.repairDoneAt
              ? 'Repair done. Check the frame and mark it fixed.'
              : `${userName(s, t.seenBy).split(' ')[0]} is working on it`
          : '';
  const steps = [
    { word: 'Alert', at: t.alertAt },
    { word: 'Seen', at: t.seenAt },
    { word: 'Working', at: t.workingAt },
    { word: 'Fixed', at: t.fixedAt ?? (t.status === 'closed' ? t.closedAt : undefined) },
  ];
  const tone = resolved ? 'ok' : t.severity;
  const sisters = t.sisterFrames.map((f) => {
    const r = s.requests.find((q) => q.ticketId === t.id && q.frameId === f && q.reason === 'sister');
    const res = r?.resultId ? s.results.find((x) => x.id === r.resultId) : undefined;
    return { f, state: res ? (res.pass ? 'ok' : 'bad') : r?.status === 'cancelled' ? 'skip' : 'wait' };
  });

  return (
    <Page title={frameWord(t.frameId)} back="/app">
      <p className="t-body -mt-3 text-ink">{issue}</p>
      <p className="t-small mt-1 text-muted">
        Lot {t.lotId} · {product.name} · {t.id}
      </p>

      <section
        aria-label="Is it resolved?"
        className={cx(
          'mt-4 flex items-center gap-4 rounded-[10px] p-4',
          tone === 'ok' ? 'bg-ok-soft' : tone === 'critical' ? 'bg-critical-soft' : tone === 'major' ? 'bg-major-soft' : 'bg-sunken',
        )}
      >
        <span className={cx('grid size-12 shrink-0 place-items-center rounded-full', resolved ? 'bg-ok text-[var(--surface-raised)]' : 'bg-raised')}>
          {resolved ? <Checkmark size={28} /> : <SeverityShape level={t.severity} size={22} />}
        </span>
        <div className="min-w-0">
          <p className={cx('t-alert', resolved ? 'text-ok' : t.severity === 'critical' ? 'text-critical' : t.severity === 'major' ? 'text-major' : 'text-ink')}>
            {resolved ? 'Resolved' : 'Not resolved yet'}
          </p>
          <p className="t-small text-ink">
            {resolved ? `${t.fixedAt ? `Fixed at ${hhmm(t.fixedAt)}${t.fixedBy ? ` by ${userName(s, t.fixedBy).split(' ')[0]}` : ''}. ` : `Closed at ${hhmm(t.closedAt!)}. `}${outcome}` : nowLine}
          </p>
        </div>
      </section>

      <ol className="mt-4 grid grid-cols-4" aria-label="Progress">
        {steps.map((st, i) => {
          const done = !!st.at;
          const next = !done && (i === 0 || !!steps[i - 1].at);
          return (
            <li key={st.word} className="relative flex flex-col items-center gap-1 text-center">
              {i > 0 && <span className={cx('absolute top-[11px] right-1/2 left-[-50%] h-0.5', done ? 'bg-ok' : 'bg-[var(--grid)]')} aria-hidden />}
              <span
                className={cx(
                  'relative z-[1] grid size-6 place-items-center rounded-full border-2',
                  done ? 'border-ok bg-ok text-[var(--surface-raised)]' : next ? 'border-line-strong bg-raised' : 'border-[var(--grid)] bg-raised',
                )}
              >
                {done && <Checkmark size={14} />}
              </span>
              <span className={cx('t-small', done ? 'font-semibold text-ink' : 'text-muted')}>{st.word}</span>
              <span className="t-data text-[12px] text-muted">{st.at ? hhmm(st.at) : next ? 'next' : ''}</span>
            </li>
          );
        })}
      </ol>

      {!resolved && t.status === 'open' && t.severity !== 'minor' && (
        <section className="mt-4">
          <ResponseTimer elapsed={esc.elapsed} limitMins={t.seenMins} state={esc.timer} level={esc.level} />
        </section>
      )}

      {action && <div className="mt-5">{action}</div>}

      <div className="mt-6 grid grid-cols-2 gap-3">
        {reading && (
          <section className="col-span-2 rounded-[10px] border border-line bg-raised p-4">
            <ReadingGauge test={reading.test} value={reading.value} min={rule?.min} max={t.kind === 'test_fail' ? rule?.max : reading.max} drift={t.kind !== 'test_fail' && reading.test === 'cv'} />
            {t.readings.length > 1 && <p className="t-small mt-3 text-muted">{t.readings.length} readings on this issue</p>}
          </section>
        )}
        {hold && (
          <section className="rounded-[10px] bg-held-soft p-4">
            <p className="t-small text-held">Yarn held</p>
            <p className="t-stat text-held">
              {roundKg(holdKg(hold, now))}
              <span className="t-small ml-1">kg</span>
            </p>
            <p className="t-small mt-1 text-ink">{hold.status === 'on_hold' ? (hold.to ? 'QC manager decides' : `Since ${hhmm(hold.from)}, still growing`) : hold.status === 'released' ? 'Released' : hold.status === 'reprocess' ? 'Sent to reprocess' : 'Sold as lower grade'}</p>
          </section>
        )}
        {sisters.length > 0 && (
          <section className="rounded-[10px] border border-line bg-raised p-4">
            <p className="t-small text-muted">Sister frames</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {sisters.map((x) => (
                <li key={x.f} className="flex items-center justify-between">
                  <span className="t-data">{x.f}</span>
                  <span className={cx('t-small-strong', x.state === 'ok' ? 'text-ok' : x.state === 'bad' ? 'text-critical' : 'text-muted')}>
                    {x.state === 'ok' ? 'Passed' : x.state === 'bad' ? 'Failed' : x.state === 'skip' ? 'Not needed' : 'Testing'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {t.photo && <img src={t.photo} alt={`Photo added when ${frameWord(t.frameId)} was fixed`} className="mt-4 w-full rounded-[10px] border border-line" />}

      <details className="group mt-6 rounded-[10px] border border-line bg-raised">
        <summary className="t-small-strong flex h-12 cursor-pointer list-none items-center justify-between px-4 text-ink">
          Full history · {timeline(t, now).length} updates
          <ChevronRight size={20} className="text-muted transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-line px-4 pt-4">
          <Timeline s={s} t={t} now={now} dense />
        </div>
      </details>

      {canAsk && !resolved && (
        <div className="mt-4 flex flex-col gap-2">
          {pendingAsk ? (
            user.role === 'qc' ? (
              <Link to={`/app/test/${pendingAsk.id}`} className="t-body-strong flex h-12 items-center justify-center rounded-[6px] border border-line bg-raised text-brand">
                Enter the lab result
              </Link>
            ) : (
              <p className="t-small rounded-[6px] bg-sunken px-3 py-2.5 text-center text-muted">Lab test asked, due {hhmm(pendingAsk.dueAt)}</p>
            )
          ) : (
            <Button variant="secondary" block onClick={() => dispatch({ type: 'test/ask', ticketId: t.id, test: askTest, by: user.id } as never)}>
              Ask the lab to test now
            </Button>
          )}
        </div>
      )}

      {canAct && !resolved && (
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
      <label className="t-small-strong flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-dashed border-line-strong text-ink hover:bg-sunken">
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
      {value && <img src={value} alt="Photo to attach" className="mt-2 max-h-40 rounded-[6px] border border-line" />}
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
          className="rounded-[6px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
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
          className="rounded-[6px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
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
        <div className={cx('rounded-[6px] p-4', result.pass ? 'bg-ok-soft' : 'bg-critical-soft')}>
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
          const ev = dispatch({ type: 'result/enter', frameId: req.frameId, test: req.test, value, requestId: req.id, by: user.id });
          const r = useMillStateSnapshot().results.findLast((x) => x.requestId === req.id && x.at === ev.at);
          setSaved(r?.id);
        }}
      >
        <p className="t-small rounded-[6px] bg-sunken px-3 py-2.5 text-ink">Instrument: {TEST[req.test].instrument}</p>
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
        <div className="rounded-[6px] border border-line bg-raised p-4">
          <ReadingGauge test={req.test} value={invalid ? undefined : value} min={rule?.min} max={rule?.max} pending />
          {value !== undefined && !invalid && !withinRule(rule, value) && req.reason !== 'retest' && (
            <p className="t-small mt-3 text-critical">Saving this alerts the supervisor{rule?.severity === 'critical' ? ' and holds the yarn' : ''}.</p>
          )}
        </div>
        <Button size="lg" block type="submit" disabled={value === undefined || invalid || (user.role !== 'tester' && user.role !== 'qc')}>
          Save result
        </Button>
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
                  't-data h-12 rounded-[6px] border text-[15px]',
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
            className="rounded-[6px] border border-line-strong bg-raised p-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
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
  const select = 'h-12 rounded-[6px] border border-line-strong bg-raised px-2 t-small';
  return (
    <Page title="History" sub={`${user.role === 'fitter' ? 'Frames you repaired' : user.role === 'tester' ? 'Issues you tested' : 'Resolved issues'}, last 31 days · ${monthName(now)}`}>
      {user.role === 'supervisor' && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-[10px] bg-raised p-3 shadow-raised">
            <p className="t-small text-muted">Your median to Seen</p>
            <p className="t-stat">{myMedian ? timer(myMedian) : '–'}</p>
          </div>
          <div className="rounded-[10px] bg-raised p-3 shadow-raised">
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
          <ul className="overflow-hidden rounded-[10px] bg-raised shadow-raised">
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
