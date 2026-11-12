import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Checkmark } from '@carbon/icons-react';
import type { Hold, MillState, Severity, ShiftId, Ticket, User } from '../engine/types';
import { useDispatch, useMillState, useNow, useUser } from '../store/store';
import { bySeverityThenAge, escalation, frameView, holdNeedsApproval, isEscalated, openHolds, type FrameStateKind } from '../engine/selectors';
import { frameWord, holdKg, lotOf, roundKg, ruleFor, userName } from '../engine/reducer';
import { OUTCOME_WORD, SEVERITY, STATUS_WORD, TEST } from '../engine/vocab';
import { ago, dateTime, dayMonth, hhmm, hmm } from '../engine/time';
import { Button, Choice, cx, Empty, SeverityBadge, StatusChip } from '../ui/primitives';
import { ReadingGauge, ResponseTimer, readingLine, ticketChip, ticketMeta } from '../ui/cards';
import { Timeline } from '../ui/timeline';
import { PageHead } from './DashShell';

function Section({ title, children, aside, className }: { title: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="t-section">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ================= Ticket table =================
export function TicketTable({ s, tickets, now, empty }: { s: MillState; tickets: Ticket[]; now: number; empty: string }) {
  const nav = useNavigate();
  if (!tickets.length) return <Empty title={empty} />;
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-raised shadow-raised">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="t-label text-muted">
            <th scope="col" className="h-9 px-3 font-semibold">Severity</th>
            <th scope="col" className="px-3 font-semibold">Frame</th>
            <th scope="col" className="px-3 font-semibold">Test</th>
            <th scope="col" className="px-3 font-semibold">Reading</th>
            <th scope="col" className="px-3 font-semibold">Status</th>
            <th scope="col" className="px-3 font-semibold">Owner</th>
            <th scope="col" className="px-3 font-semibold">Opened</th>
            <th scope="col" className="px-3 text-right font-semibold">Open for</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const live = t.status !== 'closed';
            const crit = live && t.severity === 'critical' && t.status !== 'fixed';
            const owner = t.seenBy ?? (t.raisedBy && s.users.find((u) => u.id === t.raisedBy)?.role === 'supervisor' ? t.raisedBy : undefined);
            return (
              <tr
                key={t.id}
                tabIndex={0}
                onClick={() => nav(`/dashboard/tickets/${t.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && nav(`/dashboard/tickets/${t.id}`)}
                className={cx('h-14 cursor-pointer border-t border-line hover:bg-raised focus-visible:outline-offset-[-2px]', crit && 'bg-critical-soft hover:bg-critical-soft')}
              >
                <td className="px-3">
                  <SeverityBadge level={t.severity} className={crit ? 'bg-transparent' : ''} />
                </td>
                <td className="t-data px-3">{t.frameId}</td>
                <td className="t-small px-3">{t.kind === 'drift' ? 'Winding drift' : t.test ? TEST[t.test].name : t.title}</td>
                <td className={cx('t-data px-3', crit ? 'text-critical' : '')}>{readingLine(s, t)}</td>
                <td className="px-3">
                  <StatusChip kind={ticketChip(t, now)} />
                </td>
                <td className="t-small px-3">
                  {owner ? (
                    <span className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">{userName(s, owner).split(' ').map((p) => p[0]).join('')}</span>
                      {userName(s, owner).split(' ')[0]} <span className="text-muted">· {t.shift}</span>
                    </span>
                  ) : (
                    <span className="text-muted">Not seen yet</span>
                  )}
                </td>
                <td className="t-data px-3 text-[13px] text-muted">{dateTime(t.createdAt)}</td>
                <td className="t-data px-3 text-right">{hmm((t.closedAt ?? now) - t.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ================= Tickets =================
export function Tickets() {
  const s = useMillState();
  const now = useNow();
  const [shift, setShift] = useState<'all' | ShiftId>('all');
  const [frame, setFrame] = useState('all');
  const [sev, setSev] = useState<'all' | Severity>('all');
  const [status, setStatus] = useState<'live' | 'all' | 'escalated' | 'closed'>('live');
  type St = 'live' | 'all' | 'escalated' | 'closed';
  const inStatus = (t: Ticket, st: St) => (st === 'all' ? true : st === 'live' ? t.status !== 'closed' : st === 'closed' ? t.status === 'closed' : isEscalated(t, now));
  const base = useMemo(
    () =>
      s.tickets
        .filter((t) => t.createdAt <= now)
        .filter((t) => shift === 'all' || t.shift === shift)
        .filter((t) => frame === 'all' || t.frameId === frame)
        .filter((t) => sev === 'all' || t.severity === sev),
    [s.tickets, now, shift, frame, sev],
  );
  const list = base.filter((t) => inStatus(t, status)).sort((a, b) => (status === 'live' ? bySeverityThenAge(a, b) : b.createdAt - a.createdAt));
  const TABS: [St, string][] = [['live', 'Open now'], ['escalated', 'Escalated'], ['closed', 'Closed'], ['all', 'All']];
  const select = 't-small h-10 rounded-full border border-line bg-raised px-4';
  const [view, setView] = useState<'board' | 'list'>('board');
  const boardOk = status === 'live' || status === 'escalated';
  const showBoard = boardOk && view === 'board';
  return (
    <div className="max-w-[1180px]">
      <PageHead title="Tickets" sub={`${list.length} shown · ${s.tickets.length} since 01 Oct`} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <div role="tablist" aria-label="Status" className="flex gap-1">
          {TABS.map(([k, label]) => {
            const n = base.filter((t) => inStatus(t, k)).length;
            const on = status === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setStatus(k)}
                className={cx('t-small -mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 transition-colors', on ? 'border-[var(--brand)] font-semibold text-ink' : 'border-transparent text-muted hover:text-ink')}
              >
                {label}
                <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', on ? 'bg-brand text-on-brand' : k === 'escalated' && n ? 'bg-critical-soft text-critical' : 'bg-sunken text-muted')}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        {boardOk && (
          <div role="radiogroup" aria-label="View" className="order-last ml-auto flex rounded-full border border-line bg-raised p-1">
            {(["board", "list"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cx('t-small h-8 rounded-full px-4', view === v ? 'bg-ink font-semibold text-surface' : 'text-muted hover:text-ink')}>
                {v === 'board' ? 'Board' : 'List'}
              </button>
            ))}
          </div>
        )}
        <select aria-label="Severity" className={select} value={sev} onChange={(e) => setSev(e.target.value as never)}>
          <option value="all">All severities</option>
          {(Object.keys(SEVERITY) as Severity[]).map((k) => (
            <option key={k} value={k}>
              {SEVERITY[k].word}
            </option>
          ))}
        </select>
        <select aria-label="Shift" className={select} value={shift} onChange={(e) => setShift(e.target.value as never)}>
          <option value="all">All shifts</option>
          <option value="A">A shift (00–08)</option>
          <option value="B">B shift (08–16)</option>
          <option value="C">C shift (16–24)</option>
        </select>
        <select aria-label="Frame" className={select} value={frame} onChange={(e) => setFrame(e.target.value)}>
          <option value="all">All frames</option>
          {s.frames.map((f) => (
            <option key={f.id}>{f.id}</option>
          ))}
        </select>
      </div>
      {showBoard ? (
        <TicketBoard s={s} tickets={list} now={now} />
      ) : (
        <TicketTable s={s} tickets={list} now={now} empty={status === 'live' ? 'No open tickets. All frames running normally.' : 'No tickets match these filters.'} />
      )}
    </div>
  );
}

// ================= Ticket detail =================
export function TicketDetailPage() {
  const { id } = useParams();
  const s = useMillState();
  const now = useNow();
  const t = s.tickets.find((x) => x.id === id);
  if (!t)
    return (
      <div>
        <BackLink to="/dashboard/tickets">Tickets</BackLink>
        <Empty title="Ticket not found" body="It may belong to a demo that was reset." />
      </div>
    );
  const esc = escalation(t, now);
  const reading = t.readings.at(-1);
  const rule = reading && t.kind === 'test_fail' ? ruleFor(s, t.productId, reading.test) : undefined;
  const hold = t.holdId ? s.holds.find((h) => h.id === t.holdId) : undefined;
  const steps = [
    { label: 'Alert sent', at: t.alertAt },
    { label: 'Seen', at: t.seenAt, who: t.seenBy },
    { label: 'Working on it', at: t.workingAt },
    { label: 'Fixed', at: t.fixedAt, who: t.fixedBy },
    { label: 'Closed', at: t.closedAt },
  ];
  return (
    <div className="max-w-[1180px]">
      <BackLink to="/dashboard/tickets">Tickets</BackLink>
      <PageHead
        title={`${t.frameId} · ${t.title}`}
        sub={
          <span className="flex items-center gap-2">
            <span className="t-data text-[13px]">{t.id}</span>· {ticketMeta(s, t)} · {s.products.find((p) => p.id === t.productId)!.name} · opened {dateTime(t.createdAt)}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <SeverityBadge level={t.severity} />
            <StatusChip kind={ticketChip(t, now)} />
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <ol className="grid grid-cols-5 overflow-hidden rounded-[14px] border border-line bg-raised shadow-raised" aria-label="Progress">
            {steps.map((st, i) => (
              <li key={st.label} className={cx('border-line p-3', i > 0 && 'border-l', st.at ? '' : 'text-muted')}>
                <p className="t-small-strong flex items-center gap-1.5">
                  {st.at ? <Checkmark size={16} className="text-ok" /> : <span className="size-4 rounded-full border border-line-strong" />}
                  {st.label}
                </p>
                <p className="t-data mt-1 text-[13px]">{st.at ? hhmm(st.at) : '–'}</p>
                {st.who && <p className="t-small text-muted">{userName(s, st.who).split(' ')[0]}</p>}
              </li>
            ))}
          </ol>
          <Section title="Timeline">
            <div className="rounded-[14px] border border-line bg-raised shadow-raised p-4">
              <Timeline s={s} t={t} now={now} />
            </div>
          </Section>
          {t.photo && <img src={t.photo} alt={`Photo added when ${frameWord(t.frameId)} was fixed`} className="max-w-sm rounded-[10px] border border-line" />}
        </div>
        <aside className="flex flex-col gap-4">
          {reading && (
            <div className="rounded-[14px] border border-line bg-raised shadow-raised p-4">
              <ReadingGauge test={reading.test} value={reading.value} min={rule?.min} max={t.kind === 'test_fail' ? rule?.max : reading.max} drift={t.kind !== 'test_fail' && reading.test === 'cv'} />
            </div>
          )}
          {t.severity !== 'minor' && (
            <div className="rounded-[14px] border border-line bg-raised shadow-raised p-4">
              <p className="t-small-strong mb-2 text-muted">Response</p>
              <ResponseTimer elapsed={esc.elapsed} limitMins={t.seenMins} state={esc.timer} level={esc.level} frozen={!!t.seenAt || t.status === 'closed'} />
              <p className="t-small mt-3 text-muted">
                Escalation: QC manager at {t.escalateQcMins} min, plant head at {t.escalatePhMins} min.
              </p>
            </div>
          )}
          {hold && <HoldCard s={s} h={hold} now={now} compact />}
          {t.sisterFrames.length > 0 && (
            <div className="rounded-[14px] border border-line bg-raised shadow-raised p-4">
              <p className="t-small-strong mb-2 text-muted">Sister frames</p>
              <ul className="flex flex-col gap-1.5">
                {t.sisterFrames.map((f) => {
                  const r = s.requests.find((q) => q.ticketId === t.id && q.frameId === f && q.reason === 'sister');
                  const res = r?.resultId ? s.results.find((x) => x.id === r.resultId) : undefined;
                  return (
                    <li key={f} className="flex items-center justify-between">
                      <span className="t-data">{f}</span>
                      {res ? <StatusChip kind={res.pass ? 'passed' : 'failed'} label={`${res.pass ? 'Passed' : 'Failed'} ${res.value}`} /> : r?.status === 'cancelled' ? <StatusChip kind="closed" label="Not needed" /> : <StatusChip kind="pending" label={`Test due ${r ? hhmm(r.dueAt) : ''}`} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="t-small-strong -ml-2 mb-3 inline-flex h-9 items-center gap-1 rounded-[10px] px-2 text-brand hover:bg-brand-soft">
      <ArrowLeft size={16} /> {children}
    </Link>
  );
}

// ================= Held yarn =================
export function HeldYarn() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const open = openHolds(s).sort((a, b) => b.from - a.from);
  const decided = s.holds.filter((h) => h.status !== 'on_hold').sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  return (
    <div className="max-w-[1180px]">
      <PageHead title="Held yarn" sub="Only the QC manager decides. The plant head approves overrides." />
      <HoldSummary now={now} open={open} decided={decided} />
      {open.length === 0 ? (
        <Empty icon={<Checkmark size={32} />} title="No yarn on hold" body="When a critical test fails, yarn made since the last good test is held here." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(520px,1fr))] gap-4">
          {open.map((h) => (
            <HoldCard key={h.id} s={s} h={h} now={now} user={user} />
          ))}
        </div>
      )}
      <Section title="Decided" className="mt-10">
        <div className="overflow-hidden rounded-[14px] border border-line bg-raised shadow-raised">
          <table className="w-full text-left">
            <thead>
              <tr className="t-label text-muted">
                <th scope="col" className="h-9 px-3 font-semibold">Frame</th>
                <th scope="col" className="px-3 font-semibold">Lot</th>
                <th scope="col" className="px-3 text-right font-semibold">Held</th>
                <th scope="col" className="px-3 font-semibold">Decision</th>
                <th scope="col" className="px-3 font-semibold">Reason</th>
                <th scope="col" className="px-3 font-semibold">By</th>
                <th scope="col" className="px-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((h) => {
                const d = h.decisions.at(-1);
                return (
                  <tr key={h.id} className="h-12 border-t border-line">
                    <td className="t-data px-3">{h.frameId}</td>
                    <td className="t-data px-3">{h.lotId}</td>
                    <td className="t-data px-3 text-right">{roundKg(holdKg(h, now))} kg</td>
                    <td className="px-3">
                      <StatusChip kind={h.status as never} />
                    </td>
                    <td className="t-small max-w-[360px] truncate px-3" title={d?.reason}>
                      {d?.reason}
                    </td>
                    <td className="t-small px-3">
                      {userName(s, d?.by).split(' ')[0]}
                      {d?.approvedBy ? `, approved by ${userName(s, d.approvedBy).split(' ')[0]}` : ''}
                    </td>
                    <td className="t-data px-3 text-[13px] text-muted">{h.closedAt ? dayMonth(h.closedAt) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function HoldCard({ s, h, now, user, compact }: { s: MillState; h: Hold; now: number; user?: User; compact?: boolean }) {
  const dispatch = useDispatch();
  const t = s.tickets.find((x) => x.id === h.ticketId)!;
  const product = s.products.find((p) => p.id === lotOf(s, h.lotId).productId)!;
  const kg = roundKg(holdKg(h, now));
  const pendingApproval = holdNeedsApproval(h);
  const [outcome, setOutcome] = useState<'release' | 'reprocess' | 'downgrade'>();
  const [reason, setReason] = useState('');
  const canDecide = user?.role === 'qc' && h.status === 'on_hold' && !pendingApproval;
  const canApprove = user?.role === 'plant' && pendingApproval;
  const fixed = !!h.to;
  const needsSignOff = outcome === 'release' && h.retest !== 'passed';
  const lastD = h.decisions.at(-1);

  return (
    <article className="flex flex-col gap-4 rounded-[14px] border border-line bg-raised shadow-raised p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="t-small-strong flex items-center gap-2 text-held">
            <StatusChip kind={h.status as never} />
            {pendingApproval && <StatusChip kind="escalated" label="Waiting for plant head" />}
          </p>
          <h3 className="t-section mt-2">
            {h.frameId} · Lot {h.lotId}
          </h3>
          <p className="t-small text-muted">
            {product.name} · made {hhmm(h.from)}–{h.to ? hhmm(h.to) : 'now'} {dayMonth(h.from)}
          </p>
        </div>
        <div className="text-right">
          <span className="t-stat text-held">{kg}</span>
          <span className="t-small ml-1 text-muted">kg</span>
          {!fixed && <p className="t-small text-critical">still growing</p>}
        </div>
      </header>
      {!compact && (
        <dl className="grid grid-cols-3 gap-3 border-y border-line py-3">
          <div>
            <dt className="t-small text-muted">Failed reading</dt>
            <dd className="t-data">{readingLine(s, t)}</dd>
          </div>
          <div>
            <dt className="t-small text-muted">Frame</dt>
            <dd className="t-small-strong">
              <Link className="text-brand hover:underline" to={`/dashboard/tickets/${t.id}`}>
                {t.id}
              </Link>{' '}
              · {STATUS_WORD[t.status]}
            </dd>
          </div>
          <div>
            <dt className="t-small text-muted">Re-test</dt>
            <dd>{h.retest ? <StatusChip kind={h.retest === 'pending' ? 'pending' : h.retest} label={h.retest === 'pending' ? 'In the lab' : undefined} /> : <span className="t-small text-muted">Not asked</span>}</dd>
          </div>
        </dl>
      )}
      {pendingApproval && lastD && (
        <p className="t-small rounded-[10px] bg-critical-soft px-3 py-2.5 text-ink">
          <span className="font-semibold">Release against a failed test.</span> {userName(s, lastD.by).split(' ')[0]}: “{lastD.reason}”
        </p>
      )}
      {canApprove && (
        <div className="flex gap-2">
          <Button onClick={() => dispatch({ type: 'hold/approve', holdId: h.id, by: user!.id })}>Approve release</Button>
        </div>
      )}
      {canDecide && !compact && (
        <div className="flex flex-col gap-3">
          {!fixed && <p className="t-small text-muted">The frame is not fixed yet, so this hold is still growing. You can still decide now.</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={h.retest === 'pending'} onClick={() => dispatch({ type: 'hold/retest', holdId: h.id, by: user!.id })}>
              {h.retest === 'pending' ? 'Re-test in the lab' : 'Ask for re-test'}
            </Button>
          </div>
          <div role="radiogroup" aria-label="Decision" className="grid grid-cols-3 gap-2">
            {(['release', 'reprocess', 'downgrade'] as const).map((o) => (
              <Choice key={o} selected={outcome === o} onClick={() => setOutcome(o)} className="text-center">
                {OUTCOME_WORD[o]}
              </Choice>
            ))}
          </div>
          {outcome && (
            <div className="anim-fade flex flex-col gap-1.5">
              <label htmlFor={`reason-${h.id}`} className="t-small-strong text-muted">
                Reason (goes in the decision log)
              </label>
              <input
                id={`reason-${h.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={outcome === 'release' ? 'Re-test passed on the held cones' : outcome === 'reprocess' ? 'Too far outside the limit for this buyer' : 'Sell to the open market'}
                className="h-12 rounded-[10px] border border-line-strong bg-raised px-3 t-body outline-none placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-brand"
              />
              {needsSignOff && <p className="t-small text-major">No passed re-test yet, so the plant head must approve this release.</p>}
              <div className="mt-1">
                <Button
                  disabled={!reason.trim()}
                  onClick={() => {
                    dispatch({ type: 'hold/decide', holdId: h.id, outcome, reason: reason.trim(), by: user!.id });
                    setOutcome(undefined);
                    setReason('');
                  }}
                >
                  {needsSignOff ? 'Ask plant head to release' : outcome === 'release' ? 'Release yarn' : outcome === 'reprocess' ? 'Send to reprocess' : 'Sell as lower grade'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {!canDecide && !canApprove && !compact && h.status === 'on_hold' && !pendingApproval && (
        <p className="t-small text-muted">Only the QC manager decides on held yarn.</p>
      )}
      {compact && h.status === 'on_hold' && (
        <Link to="/dashboard/held" className="t-small-strong text-brand hover:underline">
          Decide in Held yarn
        </Link>
      )}
    </article>
  );
}

// ================= Not built yet =================
export function Later({ title, what }: { title: string; what: string }) {
  return (
    <div className="max-w-[1180px]">
      <PageHead title={title} />
      <Empty title="Coming in the next milestone" body={what} />
    </div>
  );
}

const KIND_UI: Record<FrameStateKind, { word: string; dot: string; text: string; card: string }> = {
  running: { word: 'Running', dot: 'bg-ok', text: 'text-muted', card: 'border-line bg-raised' },
  warning: { word: 'Warning', dot: 'bg-major-fill', text: 'text-major', card: 'border-[var(--major-fill)] bg-major-soft' },
  fault: { word: 'Failed', dot: 'bg-critical', text: 'text-critical', card: 'border-[var(--critical)] bg-critical-soft' },
  held: { word: 'On hold', dot: 'bg-held', text: 'text-held', card: 'border-line bg-held-soft' },
  stopped: { word: 'Stopped', dot: 'bg-[var(--line-strong)]', text: 'text-muted', card: 'border-dashed border-line-strong bg-transparent' },
};
const KIND_ORDER: FrameStateKind[] = ['fault', 'warning', 'held', 'stopped', 'running'];

export function MachinesGrid() {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const [show, setShow] = useState<'all' | FrameStateKind>('all');
  const views = s.frames.map((f) => ({ f, v: frameView(s, f.id, now) }));
  const count = (k: FrameStateKind) => views.filter((x) => x.v.kind === k).length;
  const rows = [views.slice(0, 8), views.slice(8, 16), views.slice(16, 24)];
  return (
    <div className="max-w-[1180px]">
      <PageHead title="Machines" sub={`${count('running')} of ${s.frames.length} ring frames running normally`} />
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Show frames">
        {(['all', ...KIND_ORDER] as const).map((k) => {
          const n = k === 'all' ? s.frames.length : count(k);
          if (k !== 'all' && n === 0) return null;
          const on = show === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setShow(k)}
              className={cx('t-small flex h-8 items-center gap-2 rounded-full border px-3 transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line bg-raised text-muted hover:text-ink')}
            >
              {k !== 'all' && <span className={cx('size-2 rounded-full', KIND_UI[k].dot)} />}
              {k === 'all' ? 'All' : KIND_UI[k].word}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-5">
        {rows.map((row, r) => (
          <section key={r} aria-label={`Row ${r + 1}`}>
            <h2 className="t-label mb-2 text-[11px] text-muted">Row {r + 1}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
              {row.map(({ f, v }) => {
                const ui = KIND_UI[v.kind];
                const lot = lotOf(s, f.lotId);
                const product = s.products.find((p) => p.id === lot.productId)!;
                const dim = show !== 'all' && v.kind !== show;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => nav(`/dashboard/machines/${f.id}`)}
                    aria-label={`${f.id}, ${product.short}, lot ${f.lotId}: ${v.label}. ${v.line}`}
                    className={cx(
                      'flex min-w-0 flex-col gap-1 rounded-[10px] border p-3 text-left transition-[opacity,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-sheet',
                      ui.card,
                      v.kind === 'fault' && 'pulse-critical',
                      dim && 'opacity-30',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="t-body-strong tabular-nums">{f.id}</span>
                      <span className={cx('size-2 shrink-0 rounded-full', ui.dot, (v.kind === 'running' || v.kind === 'warning') && 'breathe')} aria-hidden />
                    </span>
                    <span className="t-small truncate text-muted">
                      {product.short} · Lot {f.lotId}
                    </span>
                    {v.kind === 'running' ? (
                      <span className="t-small mt-1 truncate text-muted">{v.line}</span>
                    ) : (
                      <span className="mt-1 flex flex-col">
                        <span className={cx('t-small-strong', ui.text)}>{ui.word}</span>
                        <span className="t-small line-clamp-2 text-muted">{v.line}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="t-small mt-6 text-muted">Frame detail with test history and the winding sensor trend comes in the next milestone.</p>
    </div>
  );
}

const HOLD_COLORS = ['var(--brand)', 'var(--major-fill)', 'var(--data)', 'var(--held)', 'var(--ok)'];

function HoldSummary({ now, open, decided }: { now: number; open: Hold[]; decided: Hold[] }) {
  const total = open.reduce((n, h) => n + holdKg(h, now), 0);
  const outcomes: { key: Hold['status']; word: string; cls: string }[] = [
    { key: 'released', word: 'Released', cls: 'bg-ok' },
    { key: 'reprocess', word: 'Reprocessed', cls: 'bg-major-fill' },
    { key: 'downgrade', word: 'Sold as lower grade', cls: 'bg-[var(--line-strong)]' },
  ];
  const maxOut = Math.max(1, ...outcomes.map((o) => decided.filter((h) => h.status === o.key).length));
  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-label="Held yarn summary">
      <div className="rounded-[12px] border border-line bg-raised p-5">
        <p className="t-label text-[10px] text-muted">On hold now</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="t-stat">{roundKg(total)}</span>
          <span className="t-body text-muted">kg in {open.length} lot{open.length === 1 ? '' : 's'}</span>
        </p>
        {open.length > 0 && (
          <>
            <div className="mt-4 flex h-4 gap-1 overflow-hidden rounded-full" role="img" aria-label={open.map((h) => `${h.frameId} ${roundKg(holdKg(h, now))} kg`).join(', ')}>
              {open.map((h, i) => (
                <div key={h.id} className="anim-grow-x h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(holdKg(h, now) / total) * 100}%`, background: HOLD_COLORS[i % HOLD_COLORS.length], '--i': i } as CSSProperties} />
              ))}
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {open.map((h, i) => (
                <li key={h.id} className="t-small flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: HOLD_COLORS[i % HOLD_COLORS.length] }} />
                  <span className="t-small-strong">{h.frameId}</span>
                  <span className="text-muted">
                    Lot {h.lotId} · {roundKg(holdKg(h, now))} kg · waiting {ago(now - h.from)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="rounded-[12px] border border-line bg-raised p-5">
        <p className="t-label text-[10px] text-muted">Decisions so far</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="t-stat">{decided.length}</span>
          <span className="t-body text-muted">holds decided</span>
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {outcomes.map((o, i) => {
            const n = decided.filter((h) => h.status === o.key).length;
            return (
              <li key={o.key} className="grid grid-cols-[130px_1fr_28px] items-center gap-3">
                <span className="t-small text-muted">{o.word}</span>
                <span className="h-2.5 rounded-full bg-sunken">
                  <span className={cx('anim-grow-x block h-full rounded-full', o.cls)} style={{ width: `${(n / maxOut) * 100}%`, '--i': i } as CSSProperties} />
                </span>
                <span className="t-data text-right text-[13px]">{n}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------- tickets as a board: one column per step ----------
const BOARD_COLS: { key: Ticket['status']; word: string; dot: string }[] = [
  { key: 'open', word: 'Open', dot: 'bg-critical' },
  { key: 'seen', word: 'Seen', dot: 'bg-brand' },
  { key: 'working', word: 'Working on it', dot: 'bg-major-fill' },
  { key: 'fixed', word: 'Fixed, waiting to close', dot: 'bg-ok' },
];
const SEV_STRIPE: Record<Severity, string> = { critical: 'bg-critical', major: 'bg-major-fill', minor: 'bg-[var(--line-strong)]' };

function TicketBoard({ s, tickets, now }: { s: MillState; tickets: Ticket[]; now: number }) {
  const nav = useNavigate();
  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLS.map((col, ci) => {
        const items = tickets.filter((t) => t.status === col.key);
        return (
          <section key={col.key} className="anim-in flex min-w-0 flex-col rounded-[12px] bg-sunken p-2.5" style={{ '--i': ci } as CSSProperties} aria-label={`${col.word}, ${items.length}`}>
            <header className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
              <span className="t-small-strong flex items-center gap-2">
                <span className={cx('size-2 rounded-full', col.dot)} />
                {col.word}
              </span>
              <span className="t-data rounded-full bg-raised px-2 text-[12px] text-muted">{items.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {items.length === 0 && <p className="t-small rounded-[10px] border border-dashed border-line-strong px-3 py-6 text-center text-muted">Nothing here</p>}
              {items.map((t, i) => {
                const owner = t.seenBy ?? (t.raisedBy && s.users.find((u) => u.id === t.raisedBy)?.role === 'supervisor' ? t.raisedBy : undefined);
                const esc = isEscalated(t, now);
                const mins = (now - t.alertAt) / 60000;
                const pct = Math.min(100, (mins / t.escalateQcMins) * 100);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => nav(`/dashboard/tickets/${t.id}`)}
                    className="anim-pop relative flex flex-col gap-2 overflow-hidden rounded-[10px] border border-line bg-raised p-3 pl-4 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-sheet"
                    style={{ '--i': i + ci * 3 } as CSSProperties}
                  >
                    <span className={cx('absolute inset-y-0 left-0 w-1', SEV_STRIPE[t.severity])} aria-hidden />
                    <span className="flex items-center justify-between gap-2">
                      <span className="t-body-strong">{t.frameId}</span>
                      <span className="t-data text-[12px] text-muted">{ago(now - t.createdAt)}</span>
                    </span>
                    <span className="t-small -mt-1.5 text-muted">{t.kind === 'drift' ? 'Winding drift' : t.test ? `${TEST[t.test].name} test` : t.title}</span>
                    <span className="t-data text-[12px]">{readingLine(s, t)}</span>
                    {(t.status === 'open' || t.status === 'seen') && (
                      <span className="h-1 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${Math.round(mins)} of ${t.escalateQcMins} minutes before escalation`}>
                        <span className={cx('block h-full rounded-full', pct >= 100 ? 'bg-critical' : 'bg-brand')} style={{ width: `${pct}%` }} />
                      </span>
                    )}
                    <span className="flex items-center justify-between gap-2">
                      {owner ? (
                        <span className="t-small flex items-center gap-1.5">
                          <span className="grid size-5 place-items-center rounded-full bg-brand-soft text-[9px] font-semibold text-brand">{userName(s, owner).split(' ').map((p) => p[0]).join('')}</span>
                          {userName(s, owner).split(' ')[0]}
                        </span>
                      ) : (
                        <span className="t-small text-muted">Not seen yet</span>
                      )}
                      {esc ? <span className="t-label rounded-[4px] bg-critical-soft px-1.5 text-[10px] text-critical">Escalated</span> : <span className={cx('t-label text-[10px]', t.severity === 'critical' ? 'text-critical' : t.severity === 'major' ? 'text-major' : 'text-muted')}>{SEVERITY[t.severity].word}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
