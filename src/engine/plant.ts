// Plant head views of the mill: the decisions only he makes, and the outcomes he judges.
// Pure selectors over MillState. Nothing here changes state.

import type { FrameDecision, Hold, Lot, MillState, Product, ShiftId, Ticket } from './types';
import { holdNeedsApproval } from './selectors';
import { holdKg } from './reducer';
import { DAY, HOUR } from './time';

export const REPEAT_ALERTS = 3; // serious alerts in 30 days before a frame becomes a plant head case
const WINDOW = 30 * DAY;

const serious = (t: Ticket) => t.severity !== 'minor' && t.closeReason !== 'sample_error';

export interface ReleaseCase {
  kind: 'release';
  id: string;
  hold: Hold;
  ticket?: Ticket;
  lot?: Lot;
  product?: Product;
  kg: number;
  askedBy: string;
  askedAt: number;
  reason: string;
  deadline?: number; // dispatch
}

export interface FrameCase {
  kind: 'frame';
  id: string;
  frameId: string;
  alerts: Ticket[];
  topCause?: string;
  topCauseCount: number;
  afterRoving: number;
  kgHeld: number;
  since: number;
}

export type PlantCase = ReleaseCase | FrameCase;

export function releaseCase(s: MillState, h: Hold, now: number): ReleaseCase {
  const d = h.decisions.at(-1)!;
  const lot = s.lots.find((l) => l.id === h.lotId);
  const product = lot ? s.products.find((p) => p.id === lot.productId) : undefined;
  return {
    kind: 'release',
    id: h.id,
    hold: h,
    ticket: s.tickets.find((t) => t.id === h.ticketId),
    lot,
    product,
    kg: holdKg(h, now),
    askedBy: d.by,
    askedAt: d.at,
    reason: d.reason,
    deadline: lot?.dispatchAt,
  };
}

/** Alerts on one frame, with whether a roving change came in the 2 hours before. */
export function frameAlerts(s: MillState, frameId: string, since: number, now: number) {
  return s.tickets
    .filter((t) => t.frameId === frameId && serious(t) && t.createdAt >= since && t.createdAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t) => ({ t, afterRoving: s.rovingChanges.some((r) => r.frameId === frameId && r.at <= t.createdAt && t.createdAt - r.at <= 2 * HOUR) }));
}

export function frameCase(s: MillState, frameId: string, now: number): FrameCase {
  const since = now - WINDOW;
  const rows = frameAlerts(s, frameId, since, now);
  const counts = new Map<string, number>();
  for (const { t } of rows) if (t.cause) counts.set(t.cause, (counts.get(t.cause) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const kgHeld = s.holds.filter((h) => h.frameId === frameId && h.from >= since).reduce((n, h) => n + holdKg(h, now), 0);
  return {
    kind: 'frame',
    id: frameId,
    frameId,
    alerts: rows.map((r) => r.t),
    topCause: top?.[0],
    topCauseCount: top?.[1] ?? 0,
    afterRoving: rows.filter((r) => r.afterRoving).length,
    kgHeld,
    since,
  };
}

export const lastFrameDecision = (s: MillState, frameId: string): FrameDecision | undefined =>
  s.frameDecisions.filter((d) => d.frameId === frameId).at(-1);

/** Everything waiting on the plant head, nearest deadline first. */
export function plantCases(s: MillState, now: number): PlantCase[] {
  const releases = s.holds.filter((h) => h.status === 'on_hold' && holdNeedsApproval(h)).map((h) => releaseCase(s, h, now));
  releases.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || b.kg - a.kg);

  const since = now - WINDOW;
  const byFrame = new Map<string, Ticket[]>();
  for (const t of s.tickets) if (serious(t) && t.createdAt >= since && t.createdAt <= now) byFrame.set(t.frameId, [...(byFrame.get(t.frameId) ?? []), t]);
  const frames = [...byFrame.entries()]
    .filter(([f, ts]) => {
      if (ts.length < REPEAT_ALERTS) return false;
      const d = lastFrameDecision(s, f);
      const latest = Math.max(...ts.map((t) => t.createdAt));
      return !d || d.at < latest;
    })
    .map(([f]) => frameCase(s, f, now))
    .sort((a, b) => b.alerts.length - a.alerts.length || b.kgHeld - a.kgHeld);

  return [...releases, ...frames];
}

export interface PlantLogEntry {
  at: number;
  text: string;
  reason?: string;
}

/** The plant head's own decisions, newest first. */
export function plantLog(s: MillState): PlantLogEntry[] {
  const plantIds = new Set(s.users.filter((u) => u.role === 'plant').map((u) => u.id));
  const out: PlantLogEntry[] = [];
  for (const h of s.holds)
    for (const d of h.decisions) {
      if (d.approvedBy && plantIds.has(d.approvedBy)) out.push({ at: d.approvedAt!, text: `Released ${h.frameId} Lot ${h.lotId} against a failed test`, reason: d.approvedReason ?? d.reason });
      if (d.sentBack && plantIds.has(d.sentBack.by)) out.push({ at: d.sentBack.at, text: `Sent the ${h.frameId} release back to the QC manager`, reason: d.sentBack.reason });
    }
  const words = { overhaul: 'Planned an overhaul of', procedure: 'Asked for a root-cause fix on', watch: 'Chose to keep watching' } as const;
  for (const d of s.frameDecisions) if (plantIds.has(d.by)) out.push({ at: d.at, text: `${words[d.outcome]} ${d.frameId}`, reason: d.reason });
  return out.sort((a, b) => b.at - a.at);
}

/** Holds in a window that turned out fine: the re-test passed or the sample was wrong. */
export function holdOutcomes(s: MillState, since: number, now: number) {
  const holds = s.holds.filter((h) => h.from >= since && h.from <= now);
  const fine = holds.filter((h) => h.status === 'released' && (h.retest === 'passed' || h.decisions.some((d) => /sample error/i.test(d.reason))));
  return { holds, fine, kg: holds.map((h) => holdKg(h, now)) };
}

export interface ResponseDot {
  id: string;
  frameId: string;
  shift: ShiftId;
  at: number;
  seenMins: number;
  fixMins?: number;
  toWorkMins?: number;
}

/** One dot per serious alert that was seen, for the shift comparison. */
export function responseDots(s: MillState, since: number, now: number): ResponseDot[] {
  return s.tickets
    .filter((t) => serious(t) && t.alertAt >= since && t.alertAt <= now && t.seenAt && t.raisedBy === undefined)
    .map((t) => ({
      id: t.id,
      frameId: t.frameId,
      shift: t.shift,
      at: t.alertAt,
      seenMins: (t.seenAt! - t.alertAt) / 60000,
      fixMins: t.fixedAt ? (t.fixedAt - t.alertAt) / 60000 : undefined,
      toWorkMins: t.workingAt ? (t.workingAt - t.seenAt!) / 60000 : undefined,
    }));
}
