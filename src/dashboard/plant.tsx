// Plant head (Mohit) on the dashboard: the decisions only he makes first, then a short briefing,
// then the monthly review. Priya's and Krish's screens are elsewhere and untouched.

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Phone } from '@carbon/icons-react';
import type { MillState, Ticket } from '../engine/types';
import { useDispatch, useMillState, useNow, useUser } from '../store/store';
import { escalation } from '../engine/selectors';
import { frameWord, roundKg, ruleFor, userName } from '../engine/reducer';
import { BASELINE_KG } from '../engine/analytics';
import { insights } from '../engine/insights';
import { frameAlerts, frameCase, lastFrameDecision, plantCases, plantLog, releaseCase, responseDots, type FrameCase, type PlantCase, type ReleaseCase } from '../engine/plant';
import { DAY, HOUR, dateTime, dayMonth, hhmm, mill, millDayKey, millHour } from '../engine/time';
import { TEST } from '../engine/vocab';
import { cx, SeverityBadge } from '../ui/primitives';
import { ReadingGauge } from '../ui/cards';
import { CountUp } from '../ui/charts';
import { CauseStrip, DeadlineCells, DecisionPanel, KgBlocks, Relay, ShiftDots, holdLine, stagger, stuckLine } from '../ui/plant';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (t: number) => WEEKDAYS[new Date(t + 5.5 * HOUR).getUTCDay()];

function Section({ title, sub, aside, children, className, i = 0 }: { title: string; sub?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; i?: number }) {
  return (
    <section className={cx('anim-in flex min-w-0 flex-col rounded-[12px] border border-line bg-raised p-5', className)} style={stagger(i)}>
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

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="t-small-strong flex shrink-0 items-center gap-1 rounded-[4px] text-brand-text hover:underline">
      {children} <ArrowRight size={14} />
    </Link>
  );
}

// ---------- case questions, shared by the home and the case page ----------
export function caseQuestion(c: PlantCase) {
  if (c.kind === 'release') return `Release ${roundKg(c.kg)} kg of ${c.hold.frameId} to ${c.product?.buyer ?? 'the buyer'}?`;
  return `${c.frameId} keeps failing. Overhaul it, or fix how it's run?`;
}

function DecisionCard({ s, c, now, i }: { s: MillState; c: PlantCase; now: number; i: number }) {
  const nav = useNavigate();
  const open = () => nav(`/dashboard/case/${c.id}`);
  if (c.kind === 'release') {
    const r = c.ticket?.readings.at(-1);
    const rule = c.ticket && r ? ruleFor(s, c.ticket.productId, r.test) : undefined;
    return (
      <article className="anim-in grid gap-3 rounded-[12px] border border-line-strong bg-raised p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" style={stagger(i)}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="t-section">{caseQuestion(c)}</h3>
          <p className="t-small text-muted">
            {r ? `${TEST[r.test].name} ${r.value} ${TEST[r.test].unit}, limit ${rule?.min ?? '–'}–${rule?.max ?? '–'}` : 'Failed test'} · re-test {c.hold.retest === 'failed' ? 'failed' : 'not passed'} · {userName(s, c.askedBy).split(' ')[0]} asks, {hhmm(c.askedAt)}
          </p>
          <DeadlineCells at={c.deadline} now={now} label="Dispatch" />
        </div>
        <button type="button" onClick={open} className="t-small-strong inline-flex h-10 items-center gap-1.5 justify-self-start rounded-[10px] px-1 text-brand-text hover:underline">
          Open case <ArrowRight size={14} />
        </button>
      </article>
    );
  }
  return (
    <article className="anim-in grid gap-3 rounded-[12px] border border-line bg-raised p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" style={stagger(i)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="t-section">{caseQuestion(c)}</h3>
        <p className="t-small text-muted">
          {c.alerts.length} alerts in 30 days · {c.topCause ? `${c.topCauseCount}× ${c.topCause.toLowerCase()}` : 'mixed causes'}
          {c.afterRoving ? ` · ${c.afterRoving} right after a roving change` : ''}
        </p>
        <p className="t-small text-muted">No deadline. Decide this week.</p>
      </div>
      <button type="button" onClick={open} className="t-small-strong inline-flex h-10 items-center gap-1.5 justify-self-start rounded-[10px] px-1 text-brand-text hover:underline">
        Open case <ArrowRight size={14} />
      </button>
    </article>
  );
}

// ---------- escalation that reached him ----------
function EscalationCard({ s, t, now, i }: { s: MillState; t: Ticket; now: number; i: number }) {
  const sup = s.users.find((u) => u.role === 'supervisor' && u.shift === t.shift);
  const qc = s.users.find((u) => u.role === 'qc');
  const hold = holdLine(s, t, now);
  return (
    <article className="anim-in flex flex-col gap-4 rounded-[12px] border border-[color-mix(in_srgb,var(--critical)_45%,transparent)] bg-raised p-5" style={stagger(i)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <SeverityBadge level={t.severity} />
            <span className="t-small text-muted">since {hhmm(t.alertAt)}</span>
          </div>
          <h3 className="t-section">
            {frameWord(t.frameId)} · {t.title.toLowerCase()}, and nobody has picked it up
          </h3>
          <p className="t-small text-critical">{stuckLine(s, t, now)}</p>
        </div>
        {hold && (
          <div className="text-right">
            <p className="t-stat !text-[28px] !leading-8">
              <CountUp value={roundKg(hold.kg)} ms={400} /> <span className="t-body text-muted">kg held</span>
            </p>
            <p className="t-small text-muted">{hold.growing ? `about ${Math.round(hold.perHour)} kg more every hour` : 'stopped growing'}</p>
          </div>
        )}
      </div>
      <Relay s={s} t={t} now={now} />
      <div className="flex flex-wrap gap-2">
        {[sup, qc].filter(Boolean).map((u) => (
          <a key={u!.id} href={`tel:${u!.phone?.replace(/\s/g, '') ?? ''}`} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-raised px-4 t-small-strong hover:bg-sunken">
            <Phone size={16} /> Call {u!.name.split(' ')[0]} <span className="font-mono text-[12px] font-normal text-muted">{u!.phone}</span>
          </a>
        ))}
        <Link to={`/dashboard/tickets/${t.id}`} className="t-small-strong inline-flex h-10 items-center gap-1 px-2 text-brand-text hover:underline">
          See the ticket <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}

// ---------- right now ----------

/** Right now: every live alert and who QC Alert is waiting on. Replaces the old held-yarn panel. */
function RightNow({ s, now, i }: { s: MillState; now: number; i: number }) {
  const live = s.tickets.filter((t) => t.status !== 'closed' && t.severity !== 'minor' && t.createdAt <= now).sort((a, b) => a.alertAt - b.alertAt);
  const WHO = ['the supervisor', 'the QC manager', 'you'];
  return (
    <Section i={i} title="Right now" sub="Live alerts and who QC Alert is waiting on" aside={<TextLink to="/dashboard/tickets">History</TextLink>}>
      {live.length ? (
        <ul className="flex flex-col divide-y divide-[var(--line)]">
          {live.map((t) => {
            const esc = escalation(t, now);
            const line =
              t.status === 'open'
                ? `Nobody fixing yet · ${Math.floor((now - t.alertAt) / 60000)} min · waiting on ${WHO[esc.level]}`
                : t.status === 'fixed'
                  ? `Fixed by ${userName(s, t.fixedBy).split(' ')[0]} · waiting for the lab re-test`
                  : `${userName(s, t.seenBy).split(' ')[0]} is fixing it${t.waitingPart ? ` · waiting for ${t.waitingPart.toLowerCase()}` : ''}`;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <SeverityBadge level={t.severity} />
                <span className="min-w-0 flex-1">
                  <span className="t-small-strong block">
                    {frameWord(t.frameId)} · {t.title}
                  </span>
                  <span className={cx('t-small block', t.status === 'open' && esc.level > 0 ? 'text-critical' : 'text-muted')}>{line}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-body text-muted">No live alerts. Every frame passed its last test or has been fixed.</p>
      )}
    </Section>
  );
}

export function PlantHome() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const nav = useNavigate();
  const hour = Math.floor(now / HOUR);
  const data = useMemo(() => {
    const since14 = now - 14 * DAY;
    const since56 = mill(millDayKey(now)) - 35 * DAY;
    const counts = new Map<string, number>();
    for (const t of s.tickets) if (t.severity !== 'minor' && t.createdAt >= since56 && t.createdAt <= now) counts.set(t.frameId, (counts.get(t.frameId) ?? 0) + 1);
    const top = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);
    return { dots: responseDots(s, since14, now), top, since56 };
    // recompute once a mill hour; cases and holds below stay live
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, hour]);
  const cases = plantCases(s, now);
  const toMe = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed' && escalation(t, now).level >= 2);
  const log = plantLog(s);
  const h = millHour(now);
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const n = cases.length;
  const line =
    toMe.length > 0
      ? `${toMe.length} alert${toMe.length > 1 ? 's have' : ' has'} reached you. ${n ? `${n} decision${n > 1 ? 's' : ''} also wait.` : ''}`
      : n
        ? `${n} decision${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} you today.`
        : 'Nothing needs you today.';

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="anim-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-small text-muted">
            {weekday(now)} {dayMonth(now)} · {hhmm(now)}
          </p>
          <h1 className="t-page mt-0.5">
            {greet}, {user.name.split(' ')[0]}
          </h1>
          <p className={cx('t-body mt-1', toMe.length ? 'font-semibold text-critical' : 'text-ink')} aria-live="polite">
            {line}
          </p>
        </div>
        <TextLink to="/dashboard/review">Monthly review</TextLink>
      </header>

      {toMe.length > 0 && (
        <div className="flex flex-col gap-3" aria-label="Escalated to you">
          {toMe.map((t, i) => (
            <EscalationCard key={t.id} s={s} t={t} now={now} i={i} />
          ))}
        </div>
      )}

      <Section title="Needs your decision" sub={n ? 'Nearest deadline first. Open a case to see the evidence before you decide.' : undefined}>
        {n ? (
          <div className="flex flex-col gap-3">
            {cases.map((c, i) => (
              <DecisionCard key={c.id} s={s} c={c} now={now} i={i} />
            ))}
          </div>
        ) : (
          <p className="t-body text-muted">Nothing waiting. {log[0] ? `Last decision ${dayMonth(log[0].at)}: ${log[0].text.charAt(0).toLowerCase()}${log[0].text.slice(1)}.` : ''}</p>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Section title="Response by shift" sub="Every critical and major alert, last 14 days">
          <ShiftDots dots={data.dots} />
        </Section>
        <RightNow s={s} now={now} i={0} />
      </div>

      <Section
        title="Frames that keep failing"
        sub={`Critical and major alerts since ${dayMonth(data.since56)}. Same cause after the same event points to how it's run, not the machine.`}
        aside={<TextLink to="/dashboard/review">All frames</TextLink>}
      >
        {data.top.length ? (
          <>
            <CauseStrip s={s} frameIds={data.top} since={data.since56} now={now} width={1120} onPick={(f) => nav(`/dashboard/case/${f}`)} />
            <ul className="mt-2 flex flex-col divide-y divide-[var(--line)]">
              {data.top.map((f) => {
                const c = frameCase(s, f, now);
                const d = lastFrameDecision(s, f);
                const open = cases.some((x) => x.id === f);
                return (
                  <li key={f} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <p className="t-small min-w-0">
                      <span className="font-semibold">{f}</span> <span className="text-muted">· {c.alerts.length} in 30 days{c.afterRoving ? `, ${c.afterRoving} right after a roving change` : ''}</span>
                    </p>
                    {open ? (
                      <TextLink to={`/dashboard/case/${f}`}>Open case</TextLink>
                    ) : d ? (
                      <span className="t-small text-muted">You decided {dayMonth(d.at)}</span>
                    ) : (
                      <span className="t-small text-muted">Under 3 alerts in 30 days</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="t-body text-muted">No frame failed twice in five weeks.</p>
        )}
      </Section>

      {log.length > 0 && (
        <Section title="Your recent decisions">
          <DecisionLog entries={log.slice(0, 3)} />
        </Section>
      )}
    </div>
  );
}

function DecisionLog({ entries }: { entries: { at: number; text: string; reason?: string }[] }) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--line)]">
      {entries.map((e, i) => (
        <li key={i} className="anim-fade grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2.5">
          <span className="t-data text-[13px] text-muted">{dayMonth(e.at)}</span>
          <span className="t-small">
            {e.text}
            {e.reason ? <span className="text-muted"> · “{e.reason}”</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------- case page ----------
export function CasePage() {
  const { id = '' } = useParams();
  const s = useMillState();
  const now = useNow();
  const hold = s.holds.find((h) => h.id === id);
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <Link to="/dashboard" className="t-small-strong anim-in flex items-center gap-1 self-start text-brand-text hover:underline">
        <ArrowLeft size={14} /> Overview
      </Link>
      {hold ? <ReleaseCasePage s={s} c={releaseCase(s, hold, now)} now={now} /> : s.frames.some((f) => f.id === id) ? <FrameCasePage s={s} c={frameCase(s, id, now)} now={now} /> : <p className="t-body">This case no longer exists.</p>}
    </div>
  );
}

function CaseLayout({ title, by, evidence, panel }: { title: string; by: ReactNode; evidence: ReactNode; panel: ReactNode }) {
  return (
    <>
      <header className="anim-in">
        <h1 className="t-page">{title}</h1>
        <p className="t-small mt-1 text-muted">{by}</p>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">{evidence}</div>
        <aside className="anim-in flex flex-col gap-4 rounded-[12px] border border-line-strong bg-raised p-5 lg:sticky lg:top-4" style={stagger(1)}>
          {panel}
        </aside>
      </div>
    </>
  );
}

function ReleaseCasePage({ s, c, now }: { s: MillState; c: ReleaseCase; now: number }) {
  const dispatch = useDispatch();
  const user = useUser('dash');
  const nav = useNavigate();
  const pending = c.hold.status === 'on_hold' && c.hold.decisions.at(-1)?.needsApproval && !c.hold.decisions.at(-1)?.approvedBy && !c.hold.decisions.at(-1)?.sentBack;
  const t = c.ticket;
  const r = t?.readings.at(-1);
  const rule = t && r ? ruleFor(s, t.productId, r.test) : undefined;
  const retestReq = s.requests.filter((q) => q.holdId === c.hold.id && q.resultId).at(-1);
  const retest = retestReq ? s.results.find((x) => x.id === retestReq.resultId) : undefined;
  const history = frameAlerts(s, c.hold.frameId, now - 30 * DAY, now).length;
  const before = s.holds.filter((h) => h.frameId === c.hold.frameId && h.id !== c.hold.id && h.decisions.some((d) => d.approvedBy));
  const kg = roundKg(c.kg);
  const buyer = c.product?.buyer ?? 'the buyer';
  const last = c.hold.decisions.at(-1);
  const out = (word: string) => (
    <>
      <p className="t-section">{word}</p>
      <p className="t-small text-muted">Saved under your name at {hhmm(now)}. Priya sees it on the held yarn page and the ticket.</p>
      <button type="button" onClick={() => nav('/dashboard')} className="t-small-strong inline-flex items-center gap-1 self-start text-brand-text hover:underline">
        Back to overview <ArrowRight size={14} />
      </button>
    </>
  );
  const done = !pending
    ? c.hold.status === 'released'
      ? out(`Released ${kg} kg to ${buyer}.`)
      : last?.sentBack
        ? out('Sent back to Priya.')
        : last?.outcome === 'retest'
          ? out('Re-test asked. The lab has it.')
          : out('Already decided.')
    : undefined;
  return (
    <CaseLayout
      title={caseQuestion(c)}
      by={
        <>
          {userName(s, c.askedBy)} asks, {dateTime(c.askedAt)} · {c.hold.frameId}, Lot {c.hold.lotId}, {c.product?.name}
        </>
      }
      evidence={
        <>
          <Section i={0} title="How far off the limit">
            <div className="grid gap-5 sm:grid-cols-2">
              {r && <ReadingGauge test={r.test} value={r.value} min={rule?.min} max={rule?.max} />}
              {retest ? <ReadingGauge test={retest.test} value={retest.value} min={rule?.min} max={rule?.max} /> : <div className="flex flex-col justify-center gap-1 rounded-[10px] border border-dashed border-line-strong p-4"><p className="t-small-strong">No passed re-test</p><p className="t-small text-muted">{c.hold.retest === 'pending' ? 'A re-test is with the lab.' : 'The held cones were not re-tested yet.'}</p></div>}
            </div>
            <p className="t-small mt-3 text-muted">{r ? `Failing test at ${hhmm(r.at)}${retest ? `, re-test at ${hhmm(retest.at)}` : ''}.` : ''}</p>
          </Section>
          <Section i={1} title="What's at stake">
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="t-stat">
                  <CountUp value={kg} ms={400} /> <span className="t-body text-muted">kg on hold</span>
                </p>
                <KgBlocks kg={c.kg} className="mt-3" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="t-small-strong">{buyer}</p>
                <DeadlineCells at={c.deadline} now={now} label="Dispatch" />
                {c.deadline && <p className="t-small text-muted">{dateTime(c.deadline)}</p>}
              </div>
            </div>
          </Section>
          <Section i={2} title={`Why ${userName(s, c.askedBy).split(' ')[0]} asks`}>
            <blockquote className="t-body border-l border-line-strong pl-4">“{c.reason}”</blockquote>
          </Section>
          <Section i={3} title="This frame before">
            <p className="t-small text-muted">
              {history} critical or major alert{history === 1 ? '' : 's'} on {c.hold.frameId} in 30 days. {before.length ? `You approved ${before.length} release${before.length > 1 ? 's' : ''} from this frame before.` : 'No earlier releases against a failed test from this frame.'}
            </p>
          </Section>
        </>
      }
      panel={
        <DecisionPanel
          question="Your decision"
          done={done}
          options={[
            { key: 'release', title: `Release ${kg} kg to ${buyer}`, consequence: `Ships ${c.deadline ? dayMonth(c.deadline) : 'as planned'}. Logged as your override of the failed test.`, needsReason: true },
            { key: 'retest', title: 'Ask for a re-test first', consequence: 'The lab gets an urgent request, due in 20 min. The lot stays on hold.', needsReason: false },
            { key: 'back', title: 'Send back to Priya', consequence: 'She decides reprocess or lower grade instead.', needsReason: true },
          ]}
          onDecide={(k, reason) => {
            if (k === 'release') dispatch({ type: 'hold/approve', holdId: c.hold.id, reason, by: user.id });
            else if (k === 'retest') dispatch({ type: 'hold/retest', holdId: c.hold.id, by: user.id });
            else dispatch({ type: 'hold/sendBack', holdId: c.hold.id, reason, by: user.id });
          }}
        />
      }
    />
  );
}

function FrameCasePage({ s, c, now }: { s: MillState; c: FrameCase; now: number }) {
  const dispatch = useDispatch();
  const user = useUser('dash');
  const nav = useNavigate();
  const since = mill(millDayKey(now)) - 35 * DAY;
  const all = frameAlerts(s, c.frameId, since, now);
  const roving = all.filter((a) => a.afterRoving).length;
  const causes = new Map<string, number>();
  all.forEach(({ t }) => t.cause && causes.set(t.cause, (causes.get(t.cause) ?? 0) + 1));
  const insight = insights(s, now).find((x) => x.kind === 'Repeat pattern' && x.target.endsWith(c.frameId));
  // Bad yarn this frame made between each failed test and its fix (from the record).
  const fixed = c.alerts.filter((t) => t.fixedAt);
  const kg = fixed.reduce((n, t) => n + ((s.products.find((p) => p.id === t.productId)?.kgPerHour ?? 25) * (t.fixedAt! - t.alertAt)) / HOUR, 0);
  const rovingPattern = roving >= Math.ceil(all.length / 2);
  const cause = c.topCause?.toLowerCase() ?? 'the main cause';
  const decided = lastFrameDecision(s, c.frameId);
  const openCase = plantCases(s, now).some((x) => x.id === c.frameId);
  const points = roving >= Math.ceil(all.length / 2) ? 'the changeover' : c.topCauseCount >= Math.ceil(all.length / 2) ? `one cause: ${c.topCause?.toLowerCase()}` : 'no single cause';
  const [justDecided, setJust] = useState<string | null>(null);
  const done = justDecided || (!openCase && decided) ? (
    <>
      <p className="t-section">{justDecided ?? 'Already decided.'}</p>
      <p className="t-small text-muted">{decided ? `“${decided.reason}” · ${dateTime(decided.at)}` : ''}</p>
      <p className="t-small text-muted">It comes back here if {c.frameId} fails again.</p>
      <button type="button" onClick={() => nav('/dashboard')} className="t-small-strong inline-flex items-center gap-1 self-start text-brand-text hover:underline">
        Back to overview <ArrowRight size={14} />
      </button>
    </>
  ) : undefined;
  return (
    <CaseLayout
      title={`${c.frameId} keeps failing. Overhaul it, or fix how it's run?`}
      by={<>{c.alerts.length} critical or major alerts in 30 days · about {roundKg(kg)} kg made between failed tests and fixes</>}
      evidence={
        <>
          <Section i={0} title="When it failed" sub={`The pattern points to ${points}.`}>
            <CauseStrip s={s} frameIds={[c.frameId]} since={since} now={now} width={760} />
            <p className="t-body mt-1">
              {roving ? (
                <>
                  <span className="font-semibold">{roving} of {all.length}</span> failures came within 2 hours of a roving change.
                </>
              ) : (
                'None of the failures followed a roving change.'
              )}
            </p>
          </Section>
          <Section i={1} title="Causes recorded when it was fixed">
            <ul className="flex flex-col gap-2">
              {[...causes.entries()].sort((a, b) => b[1] - a[1]).map(([cause, n]) => (
                <li key={cause} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <span className="t-small">{cause}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex gap-[3px]">
                      {Array.from({ length: n }, (_, k) => (
                        <span key={k} className="size-2.5 rounded-[2px] bg-ink" />
                      ))}
                    </span>
                    <span className="t-data w-5 text-right text-[13px]">{n}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section i={2} title="What it cost">
            <p className="t-stat">
              <CountUp value={roundKg(kg)} ms={400} /> <span className="t-body text-muted">kg made between failed tests and fixes, {fixed.length} alerts, last 30 days</span>
            </p>
            <KgBlocks kg={kg} className="mt-3" />
          </Section>
          {insight && (
            <Section i={3} title="AI · repeat pattern" sub={`${insight.confidence}% confidence · based on ${insight.basis.toLowerCase()}`} aside={<TextLink to={`/dashboard/machines/${c.frameId}`}>See the machine</TextLink>}>
              <p className="t-body-strong">{insight.title}</p>
              <p className="t-small mt-1 text-muted">{insight.body}</p>
            </Section>
          )}
        </>
      }
      panel={
        <DecisionPanel
          question="Your decision"
          done={done}
          options={[
            rovingPattern
              ? { key: 'procedure', title: 'Fix the changeover procedure', consequence: 'A draft check after every roving change. Priya writes it into the shift routine.', needsReason: true }
              : { key: 'procedure', title: `Fix the cause: ${cause}`, consequence: `Priya runs a root-cause check on ${cause} with the people involved and reports back.`, needsReason: true },
            { key: 'overhaul', title: `Plan an overhaul of ${c.frameId}`, consequence: `The frame stops for maintenance. Lot ${s.frames.find((f) => f.id === c.frameId)?.lotId} runs on its sister frames meanwhile.`, needsReason: true },
            { key: 'watch', title: 'Keep watching', consequence: `Nothing changes. This comes back if ${c.frameId} fails again.`, needsReason: true },
          ]}
          onDecide={(k, reason) => {
            dispatch({ type: 'frame/decide', frameId: c.frameId, outcome: k as 'procedure' | 'overhaul' | 'watch', reason, by: user.id });
            setJust(k === 'procedure' ? (rovingPattern ? 'Changeover procedure fix asked.' : `Root-cause fix on ${cause} asked.`) : k === 'overhaul' ? `Overhaul of ${c.frameId} planned.` : 'Watching.');
          }}
        />
      }
    />
  );
}

// ---------- monthly review ----------
export function PlantReview() {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const day = Math.floor(now / DAY);
  const d = useMemo(() => {
    const since30 = mill(millDayKey(now)) - 29 * DAY;
    const since56 = mill(millDayKey(now)) - 35 * DAY;
    // Yarn made between a failed test and the fix, per critical or major alert (measured from the record).
    const fixedAlerts = s.tickets.filter((t) => t.severity !== 'minor' && t.createdAt >= since30 && t.createdAt <= now && t.fixedAt && t.fixedAt <= now);
    const kg = fixedAlerts.map((t) => ((s.products.find((p) => p.id === t.productId)?.kgPerHour ?? 25) * (t.fixedAt! - t.alertAt)) / HOUR);
    const sorted = [...kg].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const save = (base: number) => kg.reduce((n, k) => n + Math.max(0, base - k), 0);
    const alerts30 = s.tickets.filter((t) => t.severity !== 'minor' && t.createdAt >= since30 && t.createdAt <= now);
    const o = { incidents: fixedAlerts.length, falseAlarms: alerts30.filter((t) => t.closeReason === 'sample_error').length, total: alerts30.length };
    const counts = new Map<string, number>();
    for (const t of s.tickets) if (t.severity !== 'minor' && t.createdAt >= since56 && t.createdAt <= now) counts.set(t.frameId, (counts.get(t.frameId) ?? 0) + 1);
    const top = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f]) => f);
    const rules = s.rules.filter((r) => r.updatedAt >= since30 && r.updatedBy !== 'system');
    return { since30, since56, o, med, save, top, dots: responseDots(s, since30, now), rules };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, day]);
  const r50 = (v: number) => (Math.round(v / 50) * 50).toLocaleString('en-IN');
  const log = plantLog(s);
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="anim-in">
        <h1 className="t-page">Monthly review</h1>
        <p className="t-small mt-0.5 text-muted">
          {dayMonth(d.since30)} to {dayMonth(now)}
        </p>
      </header>

      <Section title="Is catching faults early paying off" sub="Bad yarn made per incident, before QC Alert and now">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[72px_minmax(0,1fr)_72px] items-center gap-3">
            <span className="t-small-strong">Before</span>
            <KgBlocks kg={BASELINE_KG} outline />
            <span className="t-data text-right">{BASELINE_KG} kg</span>
            <span />
            <span className="t-small -mt-2 text-muted">Per incident, your own estimate. Drawn as outlines because it's an assumption.</span>
            <span />
            <span className="t-small-strong">Now</span>
            <KgBlocks kg={d.med} />
            <span className="t-data text-right">{Math.round(d.med)} kg</span>
            <span />
            <span className="t-small -mt-2 text-muted">Median yarn made from the failed test to the fix, {d.o.incidents} alerts. Measured, so solid. It leaves out the hours before the test, which QC Alert does not shorten.</span>
          </div>
          <p className="t-section">
            About {r50(d.save(BASELINE_KG))} kg saved this month <span className="t-small font-normal text-muted">· estimate, {r50(d.save(200))}–{r50(d.save(300))} kg if the old loss was 200–300 kg</span>
          </p>
          <p className="t-small text-muted">
            {d.o.falseAlarms} of {d.o.total} alerts this month were false alarms (a bad lab sample). That is the cost of reporting fast.
          </p>
        </div>
      </Section>

      <Section title="Response by shift" sub="Every critical and major alert, last 30 days">
        <ShiftDots dots={d.dots} width={1120} />
      </Section>

      <Section title="Frames that keep failing" sub={`Since ${dayMonth(d.since56)}. Click a frame to open its case.`}>
        {d.top.length ? <CauseStrip s={s} frameIds={d.top} since={d.since56} now={now} width={1120} onPick={(f) => nav(`/dashboard/case/${f}`)} /> : <p className="t-body text-muted">No frame failed twice.</p>}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Your decisions">{log.length ? <DecisionLog entries={log} /> : <p className="t-body text-muted">No decisions this month.</p>}</Section>
        <Section title="Rule changes" sub="Limits the QC manager changed this month">
          {d.rules.length ? (
            <ul className="flex flex-col divide-y divide-[var(--line)]">
              {d.rules.map((r) => {
                const p = s.products.find((x) => x.id === r.productId);
                return (
                  <li key={r.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2.5">
                    <span className="t-data text-[13px] text-muted">{dayMonth(r.updatedAt)}</span>
                    <span className="t-small">
                      {p?.short} {TEST[r.test].name.toLowerCase()} now {r.min ?? '–'} to {r.max ?? '–'} · {userName(s, r.updatedBy).split(' ')[0]}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="t-body text-muted">No limits changed this month.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
