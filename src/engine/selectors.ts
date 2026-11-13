import type { Hold, MillState, Ticket, TicketEvent, User } from './types';
import { HOUR, MIN, hhmm, sameMillDay, shiftAt, shiftEndsAt } from './time';
import { SEVERITY } from './vocab';
import { covers, holdKg, roundKg } from './reducer';

export type TimerState = 'ok' | 'warn' | 'over';

export interface Escalation {
  level: 0 | 1 | 2; // 0 supervisor, 1 QC manager, 2 plant head
  /** Past the Seen limit (5 min): the backup supervisor on the same shift is alerted too. */
  backup: boolean;
  elapsed: number; // ms from alert to Seen (or now)
  timer: TimerState;
}

/** Escalation is a pure function of time, so every device computes the same answer. */
export function escalation(t: Ticket, now: number): Escalation {
  if (t.severity === 'minor') return { level: 0, backup: false, elapsed: 0, timer: 'ok' };
  const end = t.seenAt ?? (t.status === 'closed' ? t.closedAt ?? now : now);
  const elapsed = Math.max(0, end - t.alertAt);
  const level = elapsed >= t.escalatePhMins * MIN ? 2 : elapsed >= t.escalateQcMins * MIN ? 1 : 0;
  const limit = t.seenMins * MIN;
  const timer: TimerState = elapsed >= limit ? 'over' : elapsed >= limit * 0.75 ? 'warn' : 'ok';
  return { level, backup: elapsed >= limit, elapsed, timer };
}

export const isEscalated = (t: Ticket, now: number) => escalation(t, now).level > 0;
export const isLive = (t: Ticket) => t.status !== 'closed';

/** Timeline with escalation steps merged in at the minute they happened. */
export function timeline(t: Ticket, now: number): TicketEvent[] {
  const out = [...t.events];
  const end = t.seenAt ?? (t.status === 'closed' ? t.closedAt ?? now : now);
  if (t.severity !== 'minor') {
    const backup = t.alertAt + t.seenMins * MIN;
    if (t.seenMins < t.escalateQcMins && end >= backup)
      out.push({ at: backup, kind: 'escalated', text: `Not seen in ${t.seenMins} min. Backup supervisor on the shift alerted.`, by: 'system' });
    const qc = t.alertAt + t.escalateQcMins * MIN;
    const ph = t.alertAt + t.escalatePhMins * MIN;
    if (end >= qc) out.push({ at: qc, kind: 'escalated', text: `Not seen in ${t.escalateQcMins} min. Escalated to the QC manager.`, by: 'system' });
    if (end >= ph) out.push({ at: ph, kind: 'escalated', text: `Not seen in ${t.escalatePhMins} min. Escalated to the plant head.`, by: 'system' });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function bySeverityThenAge(a: Ticket, b: Ticket) {
  return SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || a.alertAt - b.alertAt;
}

/** Which unseen alerts take over this person's phone right now. */
export function takeoversFor(s: MillState, user: User | undefined, now: number): Ticket[] {
  if (!user) return [];
  return s.tickets
    .filter((t) => t.status === 'open' && t.severity !== 'minor')
    .filter((t) => {
      const { level, backup } = escalation(t, now);
      // The frame's own supervisor first; after 5 min the other supervisor on the shift as backup.
      if (user.role === 'supervisor') return user.shift === shiftAt(now) && (covers(user, t.frameId) || backup);
      if (user.role === 'qc') return level >= 1;
      if (user.role === 'plant') return level >= 2;
      return false;
    })
    .sort(bySeverityThenAge);
}

/** Tickets that belong in a person's Alerts tab. */
export function myTickets(s: MillState, user: User, now: number): Ticket[] {
  const live = s.tickets.filter(isLive);
  let mine: Ticket[];
  if (user.role === 'supervisor')
    mine = live.filter((t) => (user.shift === shiftAt(now) && (covers(user, t.frameId) || (t.status === 'open' && escalation(t, now).backup))) || t.seenBy === user.id);
  else if (user.role === 'operator') mine = live.filter((t) => covers(user, t.frameId));
  else if (user.role === 'fitter') mine = live.filter((t) => t.fitterId === user.id);
  else if (user.role === 'qc') mine = live.filter((t) => t.severity !== 'minor' && (isEscalated(t, now) || t.holdId));
  else if (user.role === 'plant') mine = live.filter((t) => escalation(t, now).level >= 2);
  else mine = [];
  return mine.sort(bySeverityThenAge);
}

/** Why a test is asked, most risky first: a drifting frame, then sister frames, then re-tests. */
const REASON_RANK = { drift: 0, manual: 1, sister: 2, retest: 3 } as const;

/** The lab's queue, ranked by risk so the tester knows whose yarn to test first. */
export function pendingRequests(s: MillState) {
  const sev = (ticketId?: string) => {
    const t = ticketId ? s.tickets.find((x) => x.id === ticketId) : undefined;
    return t ? SEVERITY[t.severity].rank : 3;
  };
  return s.requests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || sev(a.ticketId) - sev(b.ticketId) || REASON_RANK[a.reason] - REASON_RANK[b.reason] || a.dueAt - b.dueAt);
}

/** The lab is behind when three or more urgent tests are past due. The QC manager is told. */
export function labBacklog(s: MillState, now: number) {
  return s.requests.filter((r) => r.status === 'pending' && r.urgent && r.dueAt < now);
}

export function fitterJobs(s: MillState, userId: string) {
  return s.tickets.filter((t) => t.fitterId === userId && t.status === 'working' && !t.repairDoneAt).sort(bySeverityThenAge);
}

// ---------- frames ----------
export type FrameStateKind = 'running' | 'warning' | 'fault' | 'held' | 'stopped';
export interface FrameView {
  kind: FrameStateKind;
  label: string;
  line: string;
  short?: { label?: string; line?: string }; // for the 8-across floor grid
  ticket?: Ticket;
}

export function frameView(s: MillState, frameId: string, now: number): FrameView {
  const frame = s.frames.find((f) => f.id === frameId)!;
  const live = s.tickets.filter((t) => t.frameId === frameId && t.status !== 'closed' && t.status !== 'fixed' && t.kind !== 'manual');
  const crit = live.find((t) => t.severity === 'critical');
  if (crit) return { kind: 'fault', label: 'Failed test', line: `Failed ${hhmm(crit.alertAt)}`, ticket: crit };
  const drift = live.find((t) => t.kind === 'drift');
  if (drift) return { kind: 'warning', label: 'Drift warning', line: `Drift ${hhmm(drift.alertAt)}`, ticket: drift };
  const major = live.find((t) => t.severity === 'major');
  if (major) return { kind: 'warning', label: `${major.title.replace(' test failed', '')} out of limit`, line: `Failed ${hhmm(major.alertAt)}`, short: { label: 'Failed test' }, ticket: major };
  const sister = s.requests.find((r) => r.frameId === frameId && r.status === 'pending' && r.reason === 'sister');
  if (sister) return { kind: 'warning', label: 'Sister check', line: `Test due ${hhmm(sister.dueAt)}`, short: { line: `Due ${hhmm(sister.dueAt)}` } };
  const hold = s.holds.find((h) => h.frameId === frameId && h.status === 'on_hold');
  if (hold) return { kind: 'held', label: 'Yarn on hold', line: `${roundKg(holdKg(hold, now))} kg waiting`, short: { line: `${roundKg(holdKg(hold, now))} kg held` } };
  if (frame.stopped) return { kind: 'stopped', label: 'Stopped', line: frame.stopped };
  const last = lastPass(s, frameId, now);
  return { kind: 'running', label: 'Running normally', line: last ? `Passed ${hhmm(last)}` : 'No test yet', short: { label: 'Running' } };
}

function lastPass(s: MillState, frameId: string, now: number) {
  let at = 0;
  for (const r of s.results) if (r.frameId === frameId && r.test === 'count' && r.pass && r.at <= now && r.at > at) at = r.at;
  return at || undefined;
}

// ---------- numbers for the dashboard ----------
export function openHolds(s: MillState) {
  return s.holds.filter((h) => h.status === 'on_hold');
}
export function heldKg(s: MillState, now: number) {
  return openHolds(s).reduce((sum, h) => sum + holdKg(h, now), 0);
}
export const holdNeedsApproval = (h: Hold) => {
  const d = h.decisions.at(-1);
  return !!d && d.needsApproval && !d.approvedBy && !d.sentBack;
};

export function median(xs: number[]) {
  if (!xs.length) return undefined;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function seenTimes(tickets: Ticket[]) {
  return tickets.filter((t) => t.severity !== 'minor' && t.seenAt).map((t) => t.seenAt! - t.alertAt);
}

export function todayStats(s: MillState, now: number) {
  const today = s.tickets.filter((t) => sameMillDay(t.createdAt, now) && t.createdAt <= now);
  const month = s.tickets.filter((t) => new Date(t.createdAt).getUTCMonth() === new Date(now).getUTCMonth() && t.createdAt <= now);
  const lastMonthStart = now - 40 * 24 * HOUR;
  const prev = s.tickets.filter((t) => t.createdAt >= lastMonthStart && !month.includes(t));
  return {
    today,
    medianSeenToday: median(seenTimes(today)),
    medianSeenMonth: median(seenTimes(month)),
    medianSeenPrev: median(seenTimes(prev)),
    alertsMonth: month.filter((t) => t.severity !== 'minor').length,
    escalatedMonth: month.filter((t) => isEscalated(t, now)).length,
  };
}

// ---------- held yarn: getting the decision made early ----------
export type HoldNudge = 'none' | 'qc' | 'plant';

/** Undecided after 2 hours: remind the QC manager. Undecided by the end of the shift it was held in: the plant head. */
export function holdNudge(s: MillState, h: Hold, now: number): HoldNudge {
  if (h.status !== 'on_hold') return 'none';
  const t = s.tickets.find((x) => x.id === h.ticketId);
  const since = t?.createdAt ?? h.from;
  if (now >= shiftEndsAt(since)) return 'plant';
  if (now - since >= 2 * HOUR) return 'qc';
  return 'none';
}

/** Decided holds the supervisor still has to act on: move the yarn, remove or keep the tag. */
export function decisionNotices(s: MillState, user: User, now: number) {
  if (user.role !== 'supervisor') return [];
  return s.holds.filter((h) => {
    if (h.status === 'on_hold' || !h.taggedAt || h.movedAt || !h.closedAt || h.closedAt > now) return false;
    return user.shift === shiftAt(now) ? covers(user, h.frameId) : s.tickets.find((t) => t.id === h.ticketId)?.seenBy === user.id;
  });
}

// ---------- messages: the dashboard as the go-between ----------
export interface Message {
  at: number;
  /** out = sent by QC Alert to a person, in = a person answered on the phone */
  dir: 'out' | 'in';
  who: string; // name and role
  how: string; // "App alert with sound", "Tap on the phone"
  text: string;
}

const nameOf = (s: MillState, id?: string) => (id ? s.users.find((u) => u.id === id)?.name ?? id : 'Someone');
const roleOn = (s: MillState, role: User['role'], at: number) => s.users.find((u) => u.role === role && (u.shift === 'G' || u.shift === shiftAt(at)));

/** Every message QC Alert sent for this ticket, and every answer from the floor, in order. */
export function messagesFor(s: MillState, t: Ticket, now: number): Message[] {
  const out: Message[] = [];
  const frame = `Frame ${Number(t.frameId.slice(3))}`;
  const how = t.severity === 'critical' ? 'App alert with sound' : t.severity === 'major' ? 'App alert' : 'Dashboard only';
  const sup = (at: number) => s.users.find((u) => u.role === 'supervisor' && u.shift === shiftAt(at) && covers(u, t.frameId));
  for (const e of t.events) {
    switch (e.kind) {
      case 'alerted': {
        const p = sup(e.at);
        out.push({ at: e.at, dir: 'out', who: p ? `${p.name}, supervisor` : 'Shift supervisor', how, text: `${t.title} on ${frame}, Lot ${t.lotId}` });
        break;
      }
      case 'working':
        out.push({ at: e.at, dir: 'in', who: nameOf(s, e.by), how: 'Tap on the phone', text: 'Fixing it' });
        break;
      case 'fitter_assigned':
        out.push({ at: e.at, dir: 'out', who: e.text.replace('Repair job sent to ', '').replace(' (fitter)', ', fitter'), how: 'App message', text: `Repair job: ${frame}` });
        break;
      case 'repair_done':
        out.push({ at: e.at, dir: 'in', who: nameOf(s, e.by), how: 'Tap on the phone', text: 'Repair done' });
        break;
      case 'waiting_part':
        out.push({ at: e.at, dir: 'in', who: nameOf(s, e.by), how: 'Tap on the phone', text: e.text });
        break;
      case 'fixed': {
        out.push({ at: e.at, dir: 'in', who: nameOf(s, e.by), how: 'Fix report on the phone', text: e.text });
        if (t.test || t.kind !== 'manual') {
          const lab = roleOn(s, 'tester', e.at);
          out.push({ at: e.at, dir: 'out', who: lab ? `${lab.name}, lab` : 'Lab', how: 'App message', text: `Re-test ${frame} to confirm the fix` });
        }
        break;
      }
      case 'confirmed':
        out.push({ at: e.at, dir: 'in', who: nameOf(s, e.by), how: 'Lab result on the phone', text: e.text });
        break;
      case 'reopened':
        out.push({ at: e.at, dir: 'in', who: nameOf(s, e.by), how: 'Lab result on the phone', text: e.text });
        break;
      case 'closed': {
        const qc = s.users.find((u) => u.role === 'qc');
        out.push({ at: e.at, dir: 'out', who: qc ? `${qc.name}, QC manager` : 'QC manager', how: 'Saved to the dashboard', text: e.text });
        break;
      }
    }
  }
  // Escalation for the current alert, worked out from time like everything else.
  if (t.severity !== 'minor') {
    const end = t.seenAt ?? (t.status === 'closed' ? t.closedAt ?? now : now);
    const backupAt = t.alertAt + t.seenMins * MIN;
    if (t.seenMins < t.escalateQcMins && end >= backupAt) {
      const own = sup(t.alertAt);
      const backups = s.users.filter((u) => u.role === 'supervisor' && u.shift === shiftAt(backupAt) && u.id !== own?.id);
      out.push({ at: backupAt, dir: 'out', who: backups.length ? backups.map((u) => `${u.name}, backup supervisor`).join(' and ') : 'Backup supervisor', how: 'App alert', text: `No answer in ${t.seenMins} min` });
    }
    const qcAt = t.alertAt + t.escalateQcMins * MIN;
    if (end >= qcAt) {
      const qc = s.users.find((u) => u.role === 'qc');
      out.push({ at: qcAt, dir: 'out', who: qc ? `${qc.name}, QC manager` : 'QC manager', how: 'App alert with sound', text: `No answer in ${t.escalateQcMins} min` });
    }
    const phAt = t.alertAt + t.escalatePhMins * MIN;
    if (end >= phAt) {
      const ph = s.users.find((u) => u.role === 'plant');
      out.push({ at: phAt, dir: 'out', who: ph ? `${ph.name}, plant head` : 'Plant head', how: 'App alert and a call', text: `No answer in ${t.escalatePhMins} min` });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Who QC Alert is waiting on right now for an open ticket, in plain words. */
export function waitingOn(s: MillState, t: Ticket, now: number): string {
  if (t.status === 'closed') return 'Closed';
  if (t.status === 'fixed') return t.fixConfirmedAt ? 'Closing' : 'Lab re-test';
  if (t.seenAt) return `${nameOf(s, t.seenBy).split(' ')[0]} is fixing`;
  const esc = escalation(t, now);
  if (esc.level >= 2) return 'Plant head';
  if (esc.level === 1) return 'QC manager';
  if (esc.backup) return 'Backup supervisor';
  const p = s.users.find((u) => u.role === 'supervisor' && u.shift === shiftAt(now) && covers(u, t.frameId));
  return p ? p.name.split(' ')[0] : 'Supervisor';
}
