// The QC Alert system. Pure logic: (state, event) -> state. No UI, no timers.
// Escalation is derived from time in selectors.ts, so every device agrees on it.

import type {
  Hold, MillEvent, MillState, Product, Rule, Severity, TestKind, TestRequest, TestResult, Ticket, TicketEvent,
} from './types';
import { TEST } from './vocab';
import { HOUR, MIN, hhmm, shiftAt } from './time';

// ---------- lookups ----------
export const frameOf = (s: MillState, id: string) => s.frames.find((f) => f.id === id)!;
export const lotOf = (s: MillState, id: string) => s.lots.find((l) => l.id === id)!;
export const productOfFrame = (s: MillState, frameId: string): Product => {
  const lot = lotOf(s, frameOf(s, frameId).lotId);
  return s.products.find((p) => p.id === lot.productId)!;
};
export const ruleFor = (s: MillState, productId: string, test: TestKind): Rule | undefined =>
  s.rules.find((r) => r.productId === productId && r.test === test);
export const userName = (s: MillState, id?: string) =>
  !id ? '' : id === 'system' ? 'System' : s.users.find((u) => u.id === id)?.name ?? id;
export const frameWord = (frameId: string) => `Frame ${Number(frameId.slice(3))}`;

export function withinRule(rule: Rule | undefined, value: number) {
  if (!rule) return true;
  if (rule.min !== undefined && value < rule.min) return false;
  if (rule.max !== undefined && value > rule.max) return false;
  return true;
}

export function fmt(test: TestKind, v: number) {
  return v.toFixed(TEST[test].decimals);
}
export function withUnit(test: TestKind, v: number) {
  const u = TEST[test].unit;
  return u ? `${fmt(test, v)} ${u}` : fmt(test, v);
}
export function limitText(rule: Pick<Rule, 'min' | 'max' | 'test'>) {
  const t = rule.test;
  if (rule.min !== undefined && rule.max !== undefined) return `${fmt(t, rule.min)}–${fmt(t, rule.max)}`;
  if (rule.min !== undefined) return `min ${fmt(t, rule.min)}`;
  return `max ${fmt(t, rule.max!)}`;
}
/** Floor words for a failing reading ("Too thick"), never codes. */
export function failWord(rule: Rule | undefined, test: TestKind, v: number) {
  if (rule?.min !== undefined && v < rule.min) return TEST[test].tooLow;
  if (rule?.max !== undefined && v > rule.max) return TEST[test].tooHigh;
  return 'Within limit';
}

export const holdKg = (h: Hold, now: number) =>
  Math.max(0, (h.kgPerHour * ((h.to ?? now) - h.from)) / HOUR);
export const roundKg = (kg: number) => (kg < 20 ? Math.round(kg) : kg < 50 ? Math.round(kg / 5) * 5 : Math.round(kg / 10) * 10);

function lastGoodTest(s: MillState, frameId: string, test: TestKind, before: number): TestResult | undefined {
  let best: TestResult | undefined;
  for (const r of s.results) {
    if (r.frameId === frameId && r.test === test && r.pass && !r.sampleError && r.at < before && (!best || r.at > best.at)) best = r;
  }
  return best;
}

const openTickets = (s: MillState, frameId: string) =>
  s.tickets.filter((t) => t.frameId === frameId && t.status !== 'closed' && t.kind !== 'manual');

function log(t: Ticket, at: number, kind: TicketEvent['kind'], text: string, by = 'system') {
  t.events.push({ at, kind, text, by });
}

const supervisorWord = (at: number) => `${shiftAt(at)} shift supervisor`;

// ---------- id helpers ----------
function nextTicketId(s: MillState) {
  s.seq.ticket += 1;
  return `T-${s.seq.ticket}`;
}
function nextHoldId(s: MillState) {
  s.seq.hold += 1;
  return `H-${s.seq.hold}`;
}
function addRequest(s: MillState, r: Omit<TestRequest, 'id' | 'status'>): TestRequest {
  s.seq.request += 1;
  const req: TestRequest = { ...r, id: `Q-${s.seq.request}`, status: 'pending' };
  s.requests.push(req);
  return req;
}

function newTicket(
  s: MillState,
  at: number,
  frameId: string,
  kind: Ticket['kind'],
  severity: Severity,
  title: string,
  rule?: Rule,
): Ticket {
  const frame = frameOf(s, frameId);
  const product = productOfFrame(s, frameId);
  const base = rule ?? ruleFor(s, product.id, 'count');
  const t: Ticket = {
    id: nextTicketId(s),
    createdAt: at,
    alertAt: at,
    frameId,
    lotId: frame.lotId,
    productId: product.id,
    kind,
    severity,
    title,
    readings: [],
    status: 'open',
    shift: shiftAt(at),
    seenMins: base?.seenMins ?? 5,
    escalateQcMins: base?.escalateQcMins ?? 10,
    escalatePhMins: base?.escalatePhMins ?? 20,
    sisterFrames: [],
    events: [],
  };
  s.tickets.push(t);
  return t;
}

function announce(t: Ticket, at: number) {
  if (t.severity === 'minor') log(t, at, 'alerted', 'Shown on the dashboard. Minor faults do not ring phones.');
  else log(t, at, 'alerted', `Alert sent to the ${supervisorWord(at)}${t.severity === 'critical' ? ' with sound' : ''}`);
}

/** Critical fail: hold yarn since the last good test, flag sister frames, ask the lab to test them. */
function contain(s: MillState, t: Ticket, at: number, test: TestKind) {
  const product = productOfFrame(s, t.frameId);
  const good = lastGoodTest(s, t.frameId, test, at);
  const from = good?.at ?? at - 8 * HOUR;
  const hold: Hold = {
    id: nextHoldId(s),
    ticketId: t.id,
    frameId: t.frameId,
    lotId: t.lotId,
    from,
    kgPerHour: product.kgPerHour,
    status: 'on_hold',
    decisions: [],
  };
  s.holds.push(hold);
  t.holdId = hold.id;
  const kg = roundKg(holdKg(hold, at));
  log(t, at, 'contained', `${frameWord(t.frameId)} yarn since ${hhmm(from)} on hold (about ${kg} kg so far)`);

  const sisters = s.frames.filter((f) => f.lotId === t.lotId && f.id !== t.frameId && !f.stopped);
  t.sisterFrames = sisters.map((f) => f.id);
  for (const f of sisters) {
    addRequest(s, { at, frameId: f.id, test, reason: 'sister', urgent: true, dueAt: at + 15 * MIN, ticketId: t.id });
  }
  if (sisters.length) {
    const names = sisters.map((f) => Number(f.id.slice(3)));
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : `${names[0]}`;
    log(t, at, 'contained', `Frame${names.length > 1 ? 's' : ''} ${list} flagged. Urgent ${TEST[test].name.toLowerCase()} test sent to the lab.`);
  }
}

function closeTicket(t: Ticket, at: number, reason: Ticket['closeReason'], text: string, by = 'system') {
  t.status = 'closed';
  t.closedAt = at;
  t.closeReason = reason;
  log(t, at, 'closed', text, by);
}

function maybeCloseAfterHold(s: MillState, h: Hold, at: number, by: string) {
  const t = s.tickets.find((x) => x.id === h.ticketId);
  if (t && t.status === 'fixed') closeTicket(t, at, 'fixed', 'Closed: frame fixed and held yarn decided', by);
}

// ---------- the reducer ----------
export function apply(s: MillState, e: MillEvent): void {
  switch (e.type) {
    case 'clock/set':
      s.clock = { simAt: e.simAt, realAt: e.realAt, speed: e.speed };
      return;

    case 'sim/drift': {
      const product = productOfFrame(s, e.frameId);
      s.drift[e.frameId] = { cvPct: e.cvPct, at: e.at };
      if (e.cvPct < product.cvWarnPct) return;
      const open = openTickets(s, e.frameId);
      const existing = open.find((t) => t.kind === 'drift') ?? open[0];
      if (existing) {
        existing.readings.push({ test: 'cv', value: e.cvPct, max: product.cvWarnPct, at: e.at });
        log(existing, e.at, 'reading_added', `New sensor reading added: CV +${e.cvPct.toFixed(1)}%. Grouped, no new alert.`);
        return;
      }
      const t = newTicket(s, e.at, e.frameId, 'drift', 'major', 'Winding drift: urgent test asked');
      t.readings.push({ test: 'cv', value: e.cvPct, max: product.cvWarnPct, at: e.at });
      log(t, e.at, 'created', `Winding sensor on ${e.frameId} yarn: CV up ${e.cvPct.toFixed(1)}%, past the ${product.cvWarnPct.toFixed(1)}% warning line`);
      addRequest(s, { at: e.at, frameId: e.frameId, test: 'count', reason: 'drift', urgent: true, dueAt: e.at + 15 * MIN, ticketId: t.id });
      log(t, e.at, 'contained', 'Urgent count test requested from the lab');
      log(t, e.at, 'contained', 'No yarn held until the test result');
      announce(t, e.at);
      return;
    }

    case 'result/enter': {
      const frame = frameOf(s, e.frameId);
      const product = productOfFrame(s, e.frameId);
      const rule = ruleFor(s, product.id, e.test);
      const pass = withinRule(rule, e.value);
      s.seq.result += 1;
      const result: TestResult = {
        id: `R-${s.seq.result}`,
        at: e.at,
        frameId: e.frameId,
        lotId: frame.lotId,
        test: e.test,
        value: e.value,
        pass,
        by: e.by,
        instrument: TEST[e.test].instrument,
        requestId: e.requestId,
      };
      s.results.push(result);
      const req = e.requestId ? s.requests.find((r) => r.id === e.requestId) : undefined;
      if (req) {
        req.status = 'done';
        req.resultId = result.id;
      }
      const reading = { resultId: result.id, test: e.test, value: e.value, min: rule?.min, max: rule?.max, at: e.at };
      const parent = req?.ticketId ? s.tickets.find((t) => t.id === req.ticketId) : undefined;

      // Re-test of held yarn: record it, never raise a new alert.
      if (req?.reason === 'retest' && req.holdId) {
        const h = s.holds.find((x) => x.id === req.holdId);
        if (h) h.retest = pass ? 'passed' : 'failed';
        if (parent)
          log(parent, e.at, 'note', `Re-test of held yarn ${pass ? 'passed' : 'failed again'}: ${withUnit(e.test, e.value)}${pass ? '' : '. Yarn stays on hold for the QC manager.'}`, e.by);
        return;
      }

      if (pass) {
        if (req?.reason === 'drift' && parent && parent.status !== 'closed') {
          parent.readings.push(reading);
          closeTicket(parent, e.at, 'checked_ok', `Lab test passed: ${withUnit(e.test, e.value)}. Checked, OK.`, e.by);
        } else if (req?.reason === 'sister' && parent) {
          log(parent, e.at, 'note', `${frameWord(e.frameId)} sister check passed: ${withUnit(e.test, e.value)}`, e.by);
        }
        return;
      }

      // Fail. Group with an open ticket on the same frame and test.
      const open = openTickets(s, e.frameId);
      const same = open.find((t) => t.kind === 'test_fail' && t.test === e.test);
      if (same) {
        same.readings.push(reading);
        log(same, e.at, 'reading_added', `New reading added: ${withUnit(e.test, e.value)}. Grouped, no new alert.`, e.by);
        return;
      }
      const severity = rule?.severity ?? 'major';
      const title = `${TEST[e.test].name} test failed`;
      const drift = open.find((t) => t.kind === 'drift');
      let t: Ticket;
      if (drift) {
        t = drift;
        t.kind = 'test_fail';
        t.test = e.test;
        t.severity = severity;
        t.title = title;
        t.readings.push(reading);
        t.alertAt = e.at;
        if (t.status === 'seen') {
          t.status = 'open';
          t.seenAt = undefined;
          t.seenBy = undefined;
        }
        log(t, e.at, 'upgraded', `Lab test failed: ${withUnit(e.test, e.value)} (limit ${limitText(rule!)}). Raised to ${severity}.`, e.by);
      } else {
        t = newTicket(s, e.at, e.frameId, 'test_fail', severity, title, rule);
        t.test = e.test;
        t.readings.push(reading);
        log(t, e.at, 'created', `${TEST[e.test].name} ${withUnit(e.test, e.value)} is outside the limit ${limitText(rule!)}`, e.by);
      }
      if (req?.reason === 'sister' && parent) {
        log(parent, e.at, 'note', `${frameWord(e.frameId)} sister check failed: ${withUnit(e.test, e.value)}. Opened ${t.id}.`, e.by);
      }
      if (severity === 'critical') contain(s, t, e.at, e.test);
      announce(t, e.at);
      return;
    }

    case 'result/sampleError': {
      const r = s.results.find((x) => x.id === e.resultId);
      if (!r) return;
      r.sampleError = true;
      const t = s.tickets.find((x) => x.readings.some((rd) => rd.resultId === r.id) && x.status !== 'closed');
      if (!t) return;
      log(t, e.at, 'sample_error', `Lab marked ${withUnit(r.test, r.value)} as a sample error`, e.by);
      const stillFailing = t.readings.some((rd) => {
        const res = s.results.find((x) => x.id === rd.resultId);
        return res && !res.pass && !res.sampleError;
      });
      if (stillFailing) return;
      const h = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
      if (h && h.status === 'on_hold') {
        h.to = h.to ?? e.at;
        h.status = 'released';
        h.closedAt = e.at;
        h.decisions.push({ at: e.at, by: e.by, outcome: 'release', reason: 'False alarm: sample error', needsApproval: false });
        log(t, e.at, 'note', 'Held yarn released: false alarm');
      }
      for (const q of s.requests) if (q.ticketId === t.id && q.status === 'pending') q.status = 'cancelled';
      closeTicket(t, e.at, 'sample_error', 'Closed as a false alarm. Counted in the monthly report.');
      return;
    }

    case 'ticket/seen': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status !== 'open') return;
      t.status = 'seen';
      t.seenAt = e.at;
      t.seenBy = e.by;
      log(t, e.at, 'seen', 'Seen, on it', e.by);
      return;
    }

    case 'ticket/working': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || (t.status !== 'open' && t.status !== 'seen')) return;
      if (!t.seenAt) {
        t.seenAt = e.at;
        t.seenBy = e.by;
      }
      t.status = 'working';
      t.workingAt = e.at;
      log(t, e.at, 'working', 'Working on it', e.by);
      return;
    }

    case 'ticket/assignFitter': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status === 'closed' || t.status === 'fixed') return;
      if (!t.seenAt) {
        t.seenAt = e.at;
        t.seenBy = e.by;
      }
      if (t.status !== 'working') {
        t.status = 'working';
        t.workingAt = e.at;
      }
      t.fitterId = e.fitterId;
      t.repairDoneAt = undefined;
      log(t, e.at, 'fitter_assigned', `Repair job sent to ${userName(s, e.fitterId)} (fitter)`, e.by);
      return;
    }

    case 'ticket/repairDone': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status !== 'working') return;
      t.repairDoneAt = e.at;
      log(t, e.at, 'repair_done', 'Repair done, frame ready to check', e.by);
      return;
    }

    case 'ticket/fixed': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status === 'closed' || t.status === 'fixed') return;
      if (!t.seenAt) {
        t.seenAt = e.at;
        t.seenBy = e.by;
      }
      t.status = 'fixed';
      t.fixedAt = e.at;
      t.fixedBy = e.by;
      t.cause = e.cause;
      t.note = e.note;
      t.photo = e.photo;
      log(t, e.at, 'fixed', `Fixed. Cause: ${e.cause.toLowerCase()}${e.note ? `. ${e.note}` : ''}`, e.by);
      const h = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
      if (h && !h.to) {
        h.to = e.at;
        log(t, e.at, 'note', `Hold stops growing: about ${roundKg(holdKg(h, e.at))} kg waiting for the QC manager`);
      }
      if (!h || h.status !== 'on_hold') closeTicket(t, e.at, 'fixed', 'Closed: no yarn on hold');
      return;
    }

    case 'ticket/raise': {
      const frame = frameOf(s, e.frameId);
      const t = newTicket(s, e.at, frame.id, 'manual', e.severity, e.problem);
      t.raisedBy = e.by;
      t.note = e.note;
      t.photo = e.photo;
      log(t, e.at, 'created', `Raised by hand${e.note ? `: ${e.note}` : ''}`, e.by);
      const raiser = s.users.find((u) => u.id === e.by);
      if (raiser?.role === 'supervisor') {
        t.status = 'seen';
        t.seenAt = e.at;
        t.seenBy = e.by;
        log(t, e.at, 'seen', 'Raised by the supervisor, so it starts as Seen', e.by);
      } else announce(t, e.at);
      return;
    }

    case 'test/ask': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status === 'closed' || t.status === 'fixed') return;
      if (s.requests.some((r) => r.ticketId === t.id && r.status === 'pending' && r.test === e.test)) return;
      addRequest(s, { at: e.at, frameId: t.frameId, test: e.test, reason: 'manual', urgent: true, dueAt: e.at + 15 * MIN, ticketId: t.id });
      log(t, e.at, 'contained', `Urgent ${TEST[e.test].name.toLowerCase()} test asked from the lab`, e.by);
      return;
    }

    case 'ticket/handover': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status === 'closed') return;
      t.handover = e.note;
      log(t, e.at, 'handover', `Handed over to the next shift: ${e.note}`, e.by);
      return;
    }

    case 'hold/retest': {
      const h = s.holds.find((x) => x.id === e.holdId);
      if (!h || h.status !== 'on_hold') return;
      h.retest = 'pending';
      h.decisions.push({ at: e.at, by: e.by, outcome: 'retest', reason: 'Re-test the held yarn before deciding', needsApproval: false });
      const product = productOfFrame(s, h.frameId);
      const t = s.tickets.find((x) => x.id === h.ticketId);
      addRequest(s, {
        at: e.at,
        frameId: h.frameId,
        test: t?.test ?? 'count',
        reason: 'retest',
        urgent: true,
        dueAt: e.at + 20 * MIN,
        ticketId: h.ticketId,
        holdId: h.id,
      });
      if (t) log(t, e.at, 'note', `QC manager asked for a re-test of the held ${product.short} yarn`, e.by);
      return;
    }

    case 'hold/decide': {
      const h = s.holds.find((x) => x.id === e.holdId);
      if (!h || h.status !== 'on_hold') return;
      const needsApproval = e.outcome === 'release' && h.retest !== 'passed';
      h.to = h.to ?? e.at;
      h.decisions.push({ at: e.at, by: e.by, outcome: e.outcome, reason: e.reason, needsApproval });
      const t = s.tickets.find((x) => x.id === h.ticketId);
      if (needsApproval) {
        if (t) log(t, e.at, 'note', `Release against a failed test asked: ${e.reason}. Waiting for the plant head.`, e.by);
        return;
      }
      h.status = e.outcome === 'release' ? 'released' : e.outcome;
      h.closedAt = e.at;
      if (t) log(t, e.at, 'note', `Held yarn decided: ${e.outcome === 'downgrade' ? 'sell as lower grade' : e.outcome}. ${e.reason}`, e.by);
      maybeCloseAfterHold(s, h, e.at, e.by);
      return;
    }

    case 'hold/approve': {
      const h = s.holds.find((x) => x.id === e.holdId);
      const d = h?.decisions.at(-1);
      if (!h || !d || !d.needsApproval || d.approvedBy) return;
      d.approvedBy = e.by;
      d.approvedAt = e.at;
      h.status = 'released';
      h.closedAt = e.at;
      const t = s.tickets.find((x) => x.id === h.ticketId);
      if (t) log(t, e.at, 'note', 'Plant head approved the release', e.by);
      maybeCloseAfterHold(s, h, e.at, e.by);
      return;
    }
  }
}
