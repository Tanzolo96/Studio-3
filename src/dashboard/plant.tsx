// Plant head (Mohit) on the dashboard: information only (no decisions here): the top alerts of the last week,
// who answers how fast, and what is live now; then the same monthly report the QC manager sees. Priya's and Krish's screens are elsewhere and untouched.

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from '@carbon/icons-react';
import type { MillState, Ticket } from '../engine/types';
import { useDispatch, useMillState, useNow, useUser } from '../store/store';
import { escalation } from '../engine/selectors';
import { frameWord, roundKg, limitFor, userName } from '../engine/reducer';
import { insights } from '../engine/insights';
import { frameAlerts, frameCase, lastFrameDecision, plantCases, releaseCase, responseDots, type FrameCase, type PlantCase, type ReleaseCase } from '../engine/plant';
import { DAY, HOUR, dateTime, dayMonth, hhmm, mill, millDayKey, millHour } from '../engine/time';
import { cx, SeverityBadge } from '../ui/primitives';
import { ReadingGauge, readingLine } from '../ui/cards';
import { CountUp } from '../ui/charts';
import { CauseStrip, DeadlineCells, DecisionPanel, KgBlocks, ShiftDots, stagger } from '../ui/plant';

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
  const hour = Math.floor(now / HOUR);
  const dots = useMemo(() => responseDots(s, now - 14 * DAY, now),
    // recompute once a mill hour
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, hour]);
  const week = s.tickets.filter((t) => t.createdAt > now - 7 * DAY && t.createdAt <= now);
  const crit = week.filter((t) => t.severity === 'critical');
  const major = week.filter((t) => t.severity === 'major');
  const h = millHour(now);
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

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
          <p className="t-body mt-1 text-ink">
            Last 7 days: <span className={cx('font-semibold', crit.length > 0 && 'text-critical')}>{crit.length} critical</span> and {major.length} major alert{major.length === 1 ? '' : 's'}.
          </p>
        </div>
        <TextLink to="/dashboard/report">Monthly report</TextLink>
      </header>

      <TopAlerts s={s} now={now} week={week} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Section title="Response by shift" sub="Every critical and major alert, last 14 days">
          <ShiftDots dots={dots} />
        </Section>
        <RightNow s={s} now={now} i={0} />
      </div>
    </div>
  );
}

/** The few alerts of the last week that matter most, told the way the person who fixed them told it. */
function TopAlerts({ s, now, week }: { s: MillState; now: number; week: Ticket[] }) {
  const nav = useNavigate();
  const SEV = { critical: 0, major: 1, minor: 2 } as const;
  const kg = (t: Ticket) => t.affectedKg ?? 0;
  const top = week
    .filter((t) => t.severity !== 'minor')
    .sort((a, b) => SEV[a.severity] - SEV[b.severity] || kg(b) - kg(a) || (b.fixedAt ?? now) - (b.workingAt ?? b.alertAt) - ((a.fixedAt ?? now) - (a.workingAt ?? a.alertAt)))
    .slice(0, 4);
  const rest = week.filter((t) => t.severity !== 'minor').length - top.length;
  return (
    <Section
      title="Top alerts last week"
      sub="The most serious failed tests of the last 7 days, and what the person who fixed each one reported."
      aside={<TextLink to="/dashboard/tickets?tab=all">All past alerts</TextLink>}
    >
      {top.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {top.map((t, i) => {
            const fixMins = t.fixedAt && t.workingAt ? Math.round((t.fixedAt - t.workingAt) / 60000) : undefined;
            const said = t.note ?? (t.cause ? `${t.cause}${t.part ? `, ${t.part.toLowerCase()}` : ''}` : undefined);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => nav(`/dashboard/tickets/${t.id}`)}
                  className="anim-in flex h-full w-full flex-col gap-3 rounded-[12px] border border-line p-4 text-left transition-colors hover:bg-sunken"
                  style={stagger(i)}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <SeverityBadge level={t.severity} />
                    <span className="t-small text-muted">{dateTime(t.createdAt)}</span>
                  </span>
                  <span>
                    <span className="t-body-strong block">
                      {frameWord(t.frameId)} · {t.title}
                    </span>
                    <span className="t-data block text-[13px] text-muted">
                      {readingLine(s, t)} · Lot {t.lotId}
                    </span>
                  </span>
                  <span className="rounded-[10px] bg-sunken px-3 py-2.5">
                    <span className="t-label block text-[10px] text-muted">{t.fixedBy ? `${userName(s, t.fixedBy)} reported` : 'Not fixed yet'}</span>
                    <span className="t-small mt-1 block">{said ? `“${said}”` : t.status === 'closed' ? 'No description given.' : 'Waiting for the fix report.'}</span>
                  </span>
                  <span className="t-small flex flex-wrap gap-x-4 gap-y-1 text-muted">
                    {t.part && <span>Part: <span className="text-ink">{t.part}</span></span>}
                    {t.cause && <span>Cause: <span className="text-ink">{t.cause}</span></span>}
                    {fixMins !== undefined && <span>Fixed in <span className="text-ink">{fixMins} min</span></span>}
                    {t.affectedKg !== undefined && <span>Yarn before the fix: <span className="text-ink">about {t.affectedKg} kg</span></span>}
                    {t.status !== 'closed' && <span className="text-critical">Still open</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-body text-muted">No critical or major alerts in the last 7 days.</p>
      )}
      {rest > 0 && <p className="t-small mt-3 text-muted">{rest} more critical or major alert{rest > 1 ? 's' : ''} this week, and the minor ones, are in History.</p>}
    </Section>
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
  const rule = t && r ? limitFor(s, t.productId, r) : undefined;
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

