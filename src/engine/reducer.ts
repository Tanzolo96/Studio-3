// The QC Alert system. Pure logic: (state, event) -> state. No UI, no timers.
// Escalation is derived from time in selectors.ts, so every device agrees on it.

import type {
  Hold, MillEvent, MillState, Product, Rule, Severity, TestKind, TestRequest, TestResult, Ticket, TicketEvent,
} from './types';
import { TEST } from './vocab';
import { HOUR, MIN, hhmm, mill, millDayKey, shiftAt } from './time';

// ---------- lookups ----------
export const frameOf = (s: MillState, id: string) => s.frames.find((f) => f.id === id)!;
export const lotOf = (s: MillState, id: string) => s.lots.find((l) => l.id === id)!;
export const productOfFrame = (s: MillState, frameId: string): Product => {
  const lot = lotOf(s, frameOf(s, frameId).lotId);
  return s.products.find((p) => p.id === lot.productId)!;
};
/** A yarn by its name and buyer ("40s combed" + "Buyer A"), forgiving about case and spacing. */
export function findProduct(s: MillState, yarn: string, buyer: string): Product | undefined {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const b = norm(buyer);
  return s.products.find((p) => norm(p.buyer) === b && (norm(p.name) === norm(`${yarn}, ${buyer}`) || norm(p.name).startsWith(norm(yarn))));
}
export const ruleFor = (s: MillState, productId: string, test: TestKind): Rule | undefined =>
  s.rules.find((r) => r.productId === productId && r.test === test);
export const userName = (s: MillState, id?: string) =>
  !id ? '' : id === 'system' ? 'System' : s.users.find((u) => u.id === id)?.name ?? id;
export const frameWord = (frameId: string) => `Frame ${Number(frameId.slice(3))}`;

/** Does this person look after this frame? People with no frame range cover the whole floor. */
export const covers = (u: { frames?: [number, number] }, frameId: string) => {
  if (!u.frames) return true;
  const n = Number(frameId.slice(3));
  return n >= u.frames[0] && n <= u.frames[1];
};
/** The supervisor who owns a frame's alerts at a given time. */
export const supervisorFor = (s: MillState, frameId: string, at: number) =>
  s.users.find((u) => u.role === 'supervisor' && u.shift === shiftAt(at) && covers(u, frameId));

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


const openTickets = (s: MillState, frameId: string) =>
  s.tickets.filter((t) => t.frameId === frameId && t.status !== 'closed' && t.kind !== 'manual');

function log(t: Ticket, at: number, kind: TicketEvent['kind'], text: string, by = 'system') {
  t.events.push({ at, kind, text, by });
}

const supervisorWord = (s: MillState, frameId: string, at: number) => {
  const sup = supervisorFor(s, frameId, at);
  return sup ? `${sup.name} (${shiftAt(at)} shift supervisor)` : `the ${shiftAt(at)} shift supervisor`;
};

// ---------- id helpers ----------
function nextTicketId(s: MillState) {
  s.seq.ticket += 1;
  return `T-${s.seq.ticket}`;
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

function announce(s: MillState, t: Ticket, at: number) {
  if (t.severity === 'minor') log(t, at, 'alerted', 'Shown on the dashboard. Minor faults do not ring phones.');
  else log(t, at, 'alerted', `Alert sent to ${supervisorWord(s, t.frameId, at)}${t.severity === 'critical' ? ' with sound' : ''}`);
}

/** Close once the fix is confirmed by a re-test and the held yarn is decided (or there is none). */
function maybeClose(s: MillState, t: Ticket, at: number, by: string) {
  if (t.status !== 'fixed' || !t.fixConfirmedAt) return;
  const h = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
  if (h && h.status === 'on_hold') return;
  closeTicket(t, at, 'fixed', h ? 'Closed: fix confirmed by re-test and held yarn decided' : 'Closed: fix confirmed by re-test', by);
}

function closeTicket(t: Ticket, at: number, reason: Ticket['closeReason'], text: string, by = 'system') {
  t.status = 'closed';
  t.closedAt = at;
  t.closeReason = reason;
  log(t, at, 'closed', text, by);
}

function maybeCloseAfterHold(s: MillState, h: Hold, at: number, by: string) {
  const t = s.tickets.find((x) => x.id === h.ticketId);
  if (t) maybeClose(s, t, at, by);
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
      log(t, e.at, 'created', `Winding machine yarn clearer: cops from ${e.frameId} (traced by tube colour) show CV up ${e.cvPct.toFixed(1)}%, past the ${product.cvWarnPct.toFixed(1)}% warning line`);
      addRequest(s, { at: e.at, frameId: e.frameId, test: 'count', reason: 'drift', urgent: true, dueAt: e.at + 15 * MIN, ticketId: t.id });
      log(t, e.at, 'contained', 'Urgent count test requested from the lab');
      log(t, e.at, 'contained', 'No yarn held until the test result');
      announce(s, t, e.at);
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

      // Re-test after Fixed (or asked by the QC manager): a pass confirms the fix, a fail sends it back to the line.
      if (req?.reason === 'retest' && parent) {
        const h = parent.holdId ? s.holds.find((x) => x.id === parent.holdId) : undefined;
        if (h && h.status === 'on_hold') h.retest = pass ? 'passed' : 'failed';
        if (pass) {
          parent.readings.push(reading);
          if (parent.status === 'fixed') parent.fixConfirmedAt = parent.fixConfirmedAt ?? e.at;
          log(parent, e.at, 'confirmed', `Re-test passed: ${withUnit(e.test, e.value)}. Fix confirmed.${h && h.status === 'on_hold' ? ' QC manager can decide on the held yarn.' : ''}`, e.by);
          maybeClose(s, parent, e.at, e.by);
          return;
        }
        parent.readings.push(reading);
        log(parent, e.at, 'reopened', `Re-test failed: ${withUnit(e.test, e.value)}. ${parent.status === 'fixed' ? 'Ticket reopened and the supervisor alerted again. ' : ''}Yarn stays on hold.`, e.by);
        if (parent.status === 'fixed') {
          parent.status = 'open';
          parent.alertAt = e.at;
          parent.seenAt = undefined;
          parent.seenBy = undefined;
          parent.fixedAt = undefined;
          parent.fixConfirmedAt = undefined;
          parent.lineAction = undefined;
          parent.lineActionAt = undefined;
          parent.repairDoneAt = undefined;
          parent.reopened = (parent.reopened ?? 0) + 1;
          if (h && h.status === 'on_hold') h.to = undefined; // still making suspect yarn
          announce(s, parent, e.at);
        }
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
      // No held yarn in the app: the mill handles the yarn as it does today. The app tracks the fault and the fix.
      announce(s, t, e.at);
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
      log(t, e.at, 'working', 'Fixing started', e.by);
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
      t.waitingParts = undefined;
      log(t, e.at, 'repair_done', 'Repair done, frame ready to check', e.by);
      return;
    }

    case 'ticket/needsParts': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status !== 'working' || t.repairDoneAt) return;
      t.waitingParts = { at: e.at, note: e.note };
      log(t, e.at, 'note', `Fitter can't fix it yet: ${e.note}`, e.by);
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
      t.part = e.part;
      t.affectedSince = e.affectedSince;
      t.affectedKg = e.affectedKg !== undefined && Number.isFinite(e.affectedKg) && e.affectedKg >= 0 ? Math.round(e.affectedKg) : undefined;
      t.note = e.note;
      t.photo = e.photo;
      t.waitingPart = undefined;
      const took = t.workingAt ? Math.round((e.at - t.workingAt) / MIN) : undefined;
      log(
        t,
        e.at,
        'fixed',
        `Fixed${took !== undefined ? ` in ${took} min` : ''}. Cause: ${e.cause.toLowerCase()}${e.part ? `. Part: ${e.part.toLowerCase()}` : ''}${t.affectedKg !== undefined ? `. Yarn affected: about ${t.affectedKg} kg on Lot ${t.lotId}${e.affectedSince ? ` since ${hhmm(e.affectedSince)}` : ''}` : ''}${e.note ? `. ${e.note}` : ''}`,
        e.by,
      );
      if (e.cause === 'No cause found') {
        t.rca = true;
        log(t, e.at, 'note', 'Root-cause check opened. The frame is watched for a repeat of this fault.');
      }
      const frame = frameOf(s, t.frameId);
      if (frame.stopped === 'Stopped for repair') frame.stopped = undefined;
      const h = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
      if (h && !h.to) {
        h.to = e.at;
        log(t, e.at, 'note', `Hold stops growing: about ${roundKg(holdKg(h, e.at))} kg`);
      }
      if (t.kind === 'manual' && !t.test) {
        // Raised by hand with no failed test behind it: nothing to re-test.
        t.fixConfirmedAt = e.at;
        maybeClose(s, t, e.at, e.by);
        return;
      }
      if (h && h.status === 'on_hold') h.retest = 'pending';
      addRequest(s, { at: e.at, frameId: t.frameId, test: t.test ?? 'count', reason: 'retest', urgent: true, dueAt: e.at + 20 * MIN, ticketId: t.id, holdId: h?.id });
      log(t, e.at, 'note', `Re-test of ${frameWord(t.frameId)} sent to the top of the lab's list. The ticket closes only when it passes.`);
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
      } else announce(s, t, e.at);
      return;
    }

    case 'ticket/waitPart': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status === 'closed' || t.status === 'fixed' || !e.part.trim()) return;
      if (!t.seenAt) {
        t.seenAt = e.at;
        t.seenBy = e.by;
      }
      if (t.status !== 'working') {
        t.status = 'working';
        t.workingAt = e.at;
      }
      t.waitingPart = e.part.trim();
      log(t, e.at, 'waiting_part', `Waiting for a spare part: ${t.waitingPart}`, e.by);
      return;
    }

    case 'ticket/partArrived': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || !t.waitingPart) return;
      log(t, e.at, 'note', `Spare part arrived: ${t.waitingPart}`, e.by);
      t.waitingPart = undefined;
      return;
    }

    case 'rule/set': {
      const r = s.rules.find((x) => x.id === e.ruleId);
      if (!r) return;
      if (e.min !== undefined && e.max !== undefined && e.min >= e.max) return;
      r.min = e.min;
      r.max = e.max;
      r.severity = e.severity;
      r.escalateQcMins = Math.max(1, Math.round(e.escalateQcMins));
      r.escalatePhMins = Math.max(r.escalateQcMins + 1, Math.round(e.escalatePhMins));
      r.updatedAt = e.at;
      r.updatedBy = e.by;
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

    case 'routing/set': {
      const ok = (n: number) => Number.isFinite(n) && n >= 1 && n <= 240;
      if (!ok(e.backupMins) || !ok(e.qcMins) || !ok(e.plantMins)) return;
      if (!(e.backupMins < e.qcMins && e.qcMins < e.plantMins)) return;
      for (const r of s.rules) {
        r.seenMins = Math.round(e.backupMins);
        r.escalateQcMins = Math.round(e.qcMins);
        r.escalatePhMins = Math.round(e.plantMins);
        r.updatedAt = e.at;
        r.updatedBy = e.by;
      }
      return;
    }

    case 'ruleset/add': {
      const limits = e.limits.filter((l) => TEST[l.test] && (l.min !== undefined || l.max !== undefined) && (l.min === undefined || l.max === undefined || l.min < l.max));
      const yarn = e.yarn.trim();
      const buyer = e.buyer.trim();
      if (!yarn || !buyer || !limits.length) return;
      let product = findProduct(s, yarn, buyer);
      if (!product) {
        const ne = Number(yarn.match(/(\d+(?:\.\d+)?)\s*s\b/i)?.[1] ?? yarn.match(/\d+/)?.[0] ?? 30);
        const id = `p-${`${yarn}-${buyer}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        product = { id, name: `${yarn}, ${buyer}`, short: `${Math.round(ne)}s`, nominalNe: ne, kgPerHour: Math.max(8, Math.round(900 / ne)), cvWarnPct: 2, buyer };
        s.products.push(product);
      }
      const r0 = s.rules[0];
      const chain = { seenMins: r0?.seenMins ?? 5, escalateQcMins: r0?.escalateQcMins ?? 10, escalatePhMins: r0?.escalatePhMins ?? 20 };
      const pid = product.id;
      s.rules = s.rules.filter((r) => r.productId !== pid);
      const seen = new Set<string>();
      for (const l of limits) {
        if (seen.has(l.test)) continue;
        seen.add(l.test);
        s.rules.push({ id: `${pid}-${l.test}`, productId: pid, test: l.test, min: l.min, max: l.max, severity: l.severity, ...chain, updatedAt: e.at, updatedBy: e.by, source: e.source });
      }
      return;
    }

    case 'ruleset/remove': {
      const product = s.products.find((p) => p.id === e.productId);
      if (!product) return;
      s.rules = s.rules.filter((r) => r.productId !== product.id);
      // A yarn nobody has made can go entirely; one with lots or alerts stays, with no limits.
      const used = s.lots.some((l) => l.productId === product.id) || s.tickets.some((t) => t.productId === product.id);
      if (!used) s.products = s.products.filter((p) => p.id !== product.id);
      return;
    }

    case 'rules/doc': {
      s.rulesDocs.push({ name: e.name, at: e.at, by: e.by, pages: e.pages, found: e.found.slice(0, 200), applied: e.applied });
      return;
    }

    case 'ticket/sisters': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status === 'closed' || t.sistersAskedAt) return;
      const ids = [...new Set(e.frameIds)].filter((id) => id !== t.frameId && s.frames.some((f) => f.id === id));
      t.sistersAskedAt = e.at;
      t.sisterFrames = ids;
      for (const id of ids) addRequest(s, { at: e.at, frameId: id, test: t.test ?? 'count', reason: 'sister', urgent: true, dueAt: e.at + 15 * MIN, ticketId: t.id });
      if (!ids.length) log(t, e.at, 'sisters', `No other frames running Lot ${t.lotId}`, e.by);
      else {
        const names = ids.map((id) => Number(id.slice(3)));
        const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : `${names[0]}`;
        log(t, e.at, 'sisters', `Frame${names.length > 1 ? 's' : ''} ${list} also run Lot ${t.lotId}. Sent to the top of the lab's list.`, e.by);
      }
      return;
    }

    case 'ticket/line': {
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
      t.lineAction = e.action;
      t.lineActionAt = e.at;
      const h = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
      if (e.action === 'stopped') {
        frameOf(s, t.frameId).stopped = 'Stopped for repair';
        if (h && h.status === 'on_hold' && !h.to) h.to = e.at;
        log(t, e.at, 'stopped', `${frameWord(t.frameId)} stopped${h ? `. Hold stops growing at about ${roundKg(holdKg(h, e.at))} kg` : ''}`, e.by);
      } else log(t, e.at, 'stopped', `Corrected while running${h ? '. Hold keeps growing until fixed' : ''}`, e.by);
      return;
    }

    case 'ticket/handover': {
      const t = s.tickets.find((x) => x.id === e.ticketId);
      if (!t || t.status === 'closed') return;
      t.handover = e.note;
      log(t, e.at, 'handover', `Handed over to the next shift: ${e.note}`, e.by);
      return;
    }

    case 'hold/tag': {
      const h = s.holds.find((x) => x.id === e.holdId);
      if (!h || h.status !== 'on_hold' || h.taggedAt) return;
      h.taggedAt = e.at;
      h.taggedBy = e.by;
      const t = s.tickets.find((x) => x.id === h.ticketId);
      if (t) log(t, e.at, 'tagged', `Red hold tag on the cops made since ${hhmm(h.from)}. Kept off the trolley to winding.`, e.by);
      return;
    }

    case 'hold/moved': {
      const h = s.holds.find((x) => x.id === e.holdId);
      if (!h || h.status === 'on_hold' || h.movedAt) return;
      h.movedAt = e.at;
      const t = s.tickets.find((x) => x.id === h.ticketId);
      if (t) log(t, e.at, 'decision', h.status === 'released' ? 'Tag removed, yarn sent on to winding' : 'Yarn moved for the decision and tag updated', e.by);
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
      const asker = s.users.find((u) => u.id === e.by)?.role === 'plant' ? 'Plant head' : 'QC manager';
      if (t) log(t, e.at, 'note', `${asker} asked for a re-test of the held ${product.short} yarn`, e.by);
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
      if (t) log(t, e.at, 'decision', `Held yarn decided: ${e.outcome === 'downgrade' ? 'sell as lower grade' : e.outcome}. ${e.reason} Supervisor told.`, e.by);
      maybeCloseAfterHold(s, h, e.at, e.by);
      return;
    }

    case 'hold/approve': {
      const h = s.holds.find((x) => x.id === e.holdId);
      const d = h?.decisions.at(-1);
      if (!h || !d || !d.needsApproval || d.approvedBy || d.sentBack) return;
      d.approvedBy = e.by;
      d.approvedAt = e.at;
      if (e.reason) d.approvedReason = e.reason;
      h.status = 'released';
      h.closedAt = e.at;
      const t = s.tickets.find((x) => x.id === h.ticketId);
      if (t) log(t, e.at, 'note', `Plant head approved the release${e.reason ? `: ${e.reason}` : ''}`, e.by);
      maybeCloseAfterHold(s, h, e.at, e.by);
      return;
    }

    case 'hold/sendBack': {
      const h = s.holds.find((x) => x.id === e.holdId);
      const d = h?.decisions.at(-1);
      if (!h || !d || !d.needsApproval || d.approvedBy || d.sentBack) return;
      d.sentBack = { by: e.by, at: e.at, reason: e.reason };
      const t = s.tickets.find((x) => x.id === h.ticketId);
      if (t) log(t, e.at, 'note', `Plant head sent the release back to the QC manager: ${e.reason}`, e.by);
      return;
    }

    case 'frame/decide': {
      if (!s.frames.some((f) => f.id === e.frameId)) return;
      s.frameDecisions.push({ id: `FD-${s.frameDecisions.length + 1}`, at: e.at, by: e.by, frameId: e.frameId, outcome: e.outcome, reason: e.reason });
      return;
    }
  }
}

/** Yarn this frame made on its lot between a time and now (the frame keeps running until it is fixed). */
export function yarnMadeSince(s: MillState, frameId: string, since: number, until: number) {
  return Math.max(0, (productOfFrame(s, frameId).kgPerHour * (until - since)) / HOUR);
}

/** Routine lab tests run at the start of each shift (06, 14, 22). The last few before a time, newest first. */
export function routineSlotsBefore(at: number, count = 3) {
  const out: number[] = [];
  const day0 = mill(millDayKey(at));
  for (let d = 0; d < 3 && out.length < count; d++) {
    for (const h of [22, 14, 6]) {
      const t = day0 - d * 24 * HOUR + h * HOUR;
      if (t <= at && out.length < count) out.push(t);
    }
  }
  return out.sort((a, b) => b - a);
}
