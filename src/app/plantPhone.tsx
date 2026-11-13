// Phone screens for the plant head and the floor-role cards.
// Mohit's phone shows only what needs him now: alerts that reached 20 min and urgent release approvals.

import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Checkmark, ChevronRight, Phone } from '@carbon/icons-react';
import type { MillState, Ticket, User } from '../engine/types';
import { useDispatch, useMillState, useNow, useUser } from '../store/store';
import { escalation } from '../engine/selectors';
import { frameWord, roundKg, limitFor, userName } from '../engine/reducer';
import { plantCases, releaseCase } from '../engine/plant';
import { TEST } from '../engine/vocab';
import { DAY, MIN, ago, dayMonth, hhmm, timer } from '../engine/time';
import { cx, SeverityBadge } from '../ui/primitives';
import { ReadingGauge } from '../ui/cards';
import { DeadlineCells, DecisionPanel, KgBlocks, Relay, holdLine, stuckLine } from '../ui/plant';

// ---------- plain words for a reading against its limit ----------
export function readingWords(s: MillState, t: Ticket) {
  const r = t.readings.at(-1);
  if (!r) return t.raisedBy ? 'Raised by hand' : '';
  if (r.test === 'cv' && t.kind !== 'test_fail') return `Winding sensor CV up ${r.value.toFixed(1)}%`;
  const rule = limitFor(s, t.productId, r);
  const u = TEST[r.test].unit;
  const d = TEST[r.test].decimals;
  const v = `${r.value.toFixed(d)}${u ? ` ${u}` : ''}`;
  if (rule?.min !== undefined && r.value < rule.min) return `${v}, ${(rule.min - r.value).toFixed(d)} under the ${rule.min.toFixed(d)} limit`;
  if (rule?.max !== undefined && r.value > rule.max) return `${v}, ${(r.value - rule.max).toFixed(d)} over the ${rule.max.toFixed(d)} limit`;
  return `${v}, inside the limit`;
}

// ---------- shift supervisor: a card built around the next deadline ----------
export function FloorCard({ s, t, now, user, onOpen }: { s: MillState; t: Ticket; now: number; user: User; onOpen: () => void }) {
  const esc = escalation(t, now);
  const open = t.status === 'open';
  const nextAt = esc.elapsed < t.seenMins * MIN ? t.seenMins : esc.elapsed < t.escalateQcMins * MIN ? t.escalateQcMins : t.escalatePhMins;
  const left = nextAt * MIN - esc.elapsed;
  const nextWord = nextAt === t.seenMins ? 'to say Seen' : nextAt === t.escalateQcMins ? 'before Priya is told' : 'before the plant head is told';
  const over = esc.elapsed > t.seenMins * MIN;
  const status = open ? (esc.level ? 'Escalated' : 'Waiting for you') : t.status === 'seen' ? 'Seen' : t.status === 'working' ? (t.waitingParts ? 'Waiting for parts' : t.fitterId && !t.repairDoneAt ? 'With the fitter' : 'Working on it') : 'Fixed';
  const mine = t.seenBy === user.id;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx('block w-full rounded-[10px] border bg-raised p-4 text-left shadow-raised transition-colors hover:bg-[color-mix(in_srgb,var(--surface-raised)_92%,var(--ink))]', open && t.severity === 'critical' ? 'border-critical' : 'border-line')}
    >
      <div className="flex items-center justify-between gap-2">
        <SeverityBadge level={t.severity} />
        <span className={cx('t-small-strong rounded-[6px] px-2 py-0.5', open && esc.level ? 'bg-critical-soft text-critical' : 'bg-sunken text-ink')}>{status}</span>
      </div>
      <p className="t-section mt-3">
        {frameWord(t.frameId)} · {t.title.toLowerCase()}
      </p>
      <p className="t-data mt-1">{readingWords(s, t)}</p>
      {open ? (
        <div className="mt-3 flex items-baseline gap-2">
          <span className={cx('t-reading', over ? 'text-critical' : 'text-ink')}>{left > 0 ? timer(left) : timer(esc.elapsed)}</span>
          <span className={cx('t-small', over ? 'font-semibold text-critical' : 'text-muted')}>{left > 0 ? `left ${nextWord}` : 'waiting'}</span>
        </div>
      ) : (
        <p className="t-small mt-3 text-muted">
          {mine ? 'You' : userName(s, t.seenBy).split(' ')[0]} said Seen at {hhmm(t.seenAt!)}
          {t.waitingParts ? ` · fitter waiting for ${t.waitingParts.note.toLowerCase()}` : ''} · open {ago(now - t.createdAt)}
        </p>
      )}
    </button>
  );
}

// ---------- plant head phone home ----------
export function PlantPhoneHome({ user }: { user: User }) {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const toMe = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed' && escalation(t, now).level >= 2);
  const cases = plantCases(s, now);
  const urgent = cases.filter((c) => c.kind === 'release');
  const desk = cases.length - urgent.length;
  const n = toMe.length + urgent.length;
  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="t-page">{n ? `${n} need${n === 1 ? 's' : ''} you` : 'Nothing needs you'}</h1>
      <p className="t-small mt-1 text-muted">{user.name.split(' ')[0]} · escalations and approvals</p>
      <div className="mt-4 flex flex-col gap-3">
        {toMe.map((t) => {
          const hold = holdLine(s, t, now);
          return (
            <button key={t.id} type="button" onClick={() => nav(`/app/ticket/${t.id}`)} className="anim-in block w-full rounded-[10px] border border-critical bg-raised p-4 text-left shadow-raised">
              <div className="flex items-center justify-between gap-2">
                <SeverityBadge level={t.severity} />
                <span className="t-small-strong rounded-[6px] bg-critical-soft px-2 py-0.5 text-critical">Reached you</span>
              </div>
              <p className="t-section mt-3">
                {frameWord(t.frameId)} · {t.title.toLowerCase()}
              </p>
              <p className="t-small mt-1 text-critical">{stuckLine(s, t, now)}</p>
              {hold && <p className="t-data mt-2">{roundKg(hold.kg)} kg held{hold.growing ? ', still growing' : ''}</p>}
            </button>
          );
        })}
        {urgent.map((c) => (
          <Link key={c.id} to={`/app/case/${c.id}`} className="anim-in flex items-center gap-3 rounded-[10px] border border-line-strong bg-raised p-4 shadow-raised">
            <div className="min-w-0 flex-1">
              <p className="t-small-strong text-muted">Approval</p>
              <p className="t-body-strong mt-1">
                Release {roundKg(c.kg)} kg of {c.hold.frameId} to {c.product?.buyer}?
              </p>
              <div className="mt-2">
                <DeadlineCells at={c.deadline} now={now} cells={8} label="Dispatch" />
              </div>
            </div>
            <ChevronRight size={20} className="shrink-0 text-muted" />
          </Link>
        ))}
        {n === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-[16px] bg-raised px-6 py-12 text-center shadow-raised">
            <span className="grid size-16 place-items-center rounded-full bg-ok-soft text-ok">
              <Checkmark size={32} />
            </span>
            <p className="t-section">All clear</p>
            <p className="t-small max-w-[30ch] text-muted">This phone rings only when an alert reaches 20 minutes with nobody fixing it.</p>
          </div>
        )}
        {desk > 0 && (
          <p className="t-small rounded-[10px] bg-sunken px-3 py-2.5 text-ink">
            {desk} frame decision{desk > 1 ? 's wait' : ' waits'} at your desk. They need the full evidence, so they stay on the dashboard.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- plant head on an escalated ticket ----------
export function PlantEscalationBlock({ s, t, now }: { s: MillState; t: Ticket; now: number }) {
  const sup = s.users.find((u) => u.role === 'supervisor' && u.shift === t.shift);
  const qc = s.users.find((u) => u.role === 'qc');
  const hold = holdLine(s, t, now);
  return (
    <section aria-label="Where it is stuck" className="mt-4 flex flex-col gap-4 rounded-[16px] border border-line bg-raised p-4">
      <p className="t-body-strong">{stuckLine(s, t, now)}</p>
      <Relay s={s} t={t} now={now} compact />
      {hold && (
        <div>
          <p className="t-small-strong">
            {roundKg(hold.kg)} kg held{hold.growing ? `, about ${Math.round(hold.perHour)} kg more every hour` : ''}
          </p>
          <KgBlocks kg={hold.kg} size="sm" className="mt-2" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {[sup, qc].filter(Boolean).map((u) => (
          <a key={u!.id} href={`tel:${u!.phone?.replace(/\s/g, '') ?? ''}`} className="flex h-12 items-center justify-between rounded-[10px] border border-line-strong bg-raised px-4 hover:bg-sunken">
            <span className="t-body-strong flex items-center gap-2">
              <Phone size={18} /> Call {u!.name.split(' ')[0]}
            </span>
            <span className="t-data text-[13px] text-muted">{u!.phone}</span>
          </a>
        ))}
      </div>
      <p className="t-small text-muted">The fix stays with the shift supervisor. Your job here is to get someone moving.</p>
    </section>
  );
}

// ---------- plant head approval on the phone ----------
export function PhoneCase() {
  const { id } = useParams();
  const s = useMillState();
  const now = useNow();
  const user = useUser('app');
  const dispatch = useDispatch();
  const nav = useNavigate();
  const hold = s.holds.find((h) => h.id === id);
  if (!hold || user.role !== 'plant')
    return (
      <div className="px-4 pt-4">
        <Link to="/app" className="t-small-strong inline-flex h-12 items-center gap-1 text-brand-text">
          <ArrowLeft size={20} /> Back
        </Link>
        <p className="t-body mt-2">This approval is not here any more.</p>
      </div>
    );
  const c = releaseCase(s, hold, now);
  const t = c.ticket;
  const r = t?.readings.at(-1);
  const rule = t && r ? limitFor(s, t.productId, r) : undefined;
  const last = hold.decisions.at(-1);
  const pending = hold.status === 'on_hold' && last?.needsApproval && !last.approvedBy && !last.sentBack;
  const kg = roundKg(c.kg);
  const buyer = c.product?.buyer ?? 'the buyer';
  return (
    <div className="px-4 pt-4 pb-8">
      <Link to="/app" className="t-small-strong -ml-2 mb-2 inline-flex h-12 items-center gap-1 rounded-[10px] px-2 text-brand-text hover:bg-brand-soft">
        <ArrowLeft size={20} /> Back
      </Link>
      <h1 className="t-page">
        Release {kg} kg to {buyer}?
      </h1>
      <p className="t-small mt-1 text-muted">
        {hold.frameId} · Lot {hold.lotId} · {userName(s, c.askedBy).split(' ')[0]} asks, {hhmm(c.askedAt)}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {r && (
          <div className="rounded-[10px] border border-line bg-raised p-4">
            <ReadingGauge test={r.test} value={r.value} min={rule?.min} max={rule?.max} />
            <p className="t-small mt-2 text-muted">{hold.retest === 'pending' ? 'Re-test with the lab.' : 'No passed re-test.'}</p>
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-raised p-4">
          <KgBlocks kg={c.kg} size="sm" />
          <DeadlineCells at={c.deadline} now={now} cells={8} label="Dispatch" />
          {c.deadline && <p className="t-small text-muted">{dayMonth(c.deadline)}, {hhmm(c.deadline)}</p>}
        </div>
        <blockquote className="t-body border-l border-line-strong pl-3">“{c.reason}”</blockquote>
        <DecisionPanel
          compact
          question="Your decision"
          done={
            !pending ? (
              <>
                <p className="t-section">{hold.status === 'released' ? `Released ${kg} kg to ${buyer}.` : last?.sentBack ? 'Sent back to Priya.' : last?.outcome === 'retest' ? 'Re-test asked.' : 'Decided.'}</p>
                <button type="button" onClick={() => nav('/app')} className="t-small-strong self-start text-brand-text">
                  Back to your list
                </button>
              </>
            ) : undefined
          }
          options={[
            { key: 'release', title: `Release ${kg} kg to ${buyer}`, consequence: `Ships ${c.deadline ? dayMonth(c.deadline) : 'as planned'}. Logged as your override.`, needsReason: true },
            { key: 'retest', title: 'Ask for a re-test first', consequence: 'Urgent lab request, due in 20 min.', needsReason: false },
            { key: 'back', title: 'Send back to Priya', consequence: 'She decides reprocess or lower grade.', needsReason: true },
          ]}
          onDecide={(k, reason) => {
            if (k === 'release') dispatch({ type: 'hold/approve', holdId: hold.id, reason, by: user.id });
            else if (k === 'retest') dispatch({ type: 'hold/retest', holdId: hold.id, by: user.id });
            else dispatch({ type: 'hold/sendBack', holdId: hold.id, reason, by: user.id });
          }}
        />
      </div>
    </div>
  );
}

// ---------- fitter: what this frame failed for before ----------
export function pastCauses(s: MillState, t: Ticket) {
  return s.tickets
    .filter((x) => x.frameId === t.frameId && x.id !== t.id && x.cause && x.createdAt > t.createdAt - 45 * DAY)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3)
    .map((x) => ({ at: x.createdAt, cause: x.cause! }));
}

