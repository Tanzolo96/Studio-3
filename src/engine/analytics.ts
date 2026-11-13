// Numbers behind the dashboard charts. Pure functions over the mill state.

import type { MillState, Severity, ShiftId, Ticket } from './types';
import { DAY, HOUR, mill, millDayKey, millHour, shiftAt } from './time';
import { frameView, median, type FrameStateKind } from './selectors';

/** Before QC Alert: about 250 kg of bad yarn per frame per incident, the middle of the plant head's 200 to 300 kg. Every screen and poster uses this one baseline. */
export const BASELINE_KG = 250;

const dayStart = (t: number) => mill(millDayKey(t));

export interface DayBucket {
  day: number; // mill-day start
  critical: number;
  major: number;
  minor: number;
}

export function dailyAlerts(s: MillState, now: number, days = 30): DayBucket[] {
  const first = dayStart(now) - (days - 1) * DAY;
  const out: DayBucket[] = Array.from({ length: days }, (_, i) => ({ day: first + i * DAY, critical: 0, major: 0, minor: 0 }));
  for (const t of s.tickets) {
    if (t.createdAt > now || t.createdAt < first) continue;
    const i = Math.floor((dayStart(t.createdAt) - first) / DAY);
    if (out[i]) out[i][t.severity] += 1;
  }
  return out;
}

/** Rolling median minutes to Seen, one point per day (null until there is data). */
export function seenTrend(s: MillState, now: number, days = 30, window = 7): { day: number; mins: number | null }[] {
  const first = dayStart(now) - (days - 1) * DAY;
  const seen = s.tickets.filter((t) => t.severity !== 'minor' && t.seenAt && t.seenAt <= now);
  return Array.from({ length: days }, (_, i) => {
    const day = first + i * DAY;
    const from = day - (window - 1) * DAY;
    const xs = seen.filter((t) => t.alertAt >= from && t.alertAt < day + DAY).map((t) => (t.seenAt! - t.alertAt) / 60000);
    const m = median(xs);
    return { day, mins: m === undefined ? null : m };
  });
}

export function topCauses(tickets: Ticket[]) {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const c = t.closeReason === 'sample_error' ? 'False alarm (sample error)' : t.closeReason === 'checked_ok' ? 'Checked, OK (early warning)' : t.cause;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function shiftResponse(tickets: Ticket[]): { shift: ShiftId; mins: number | null; n: number }[] {
  return (['A', 'B', 'C'] as ShiftId[]).map((shift) => {
    const xs = tickets.filter((t) => t.severity !== 'minor' && t.seenAt && shiftAt(t.alertAt) === shift).map((t) => (t.seenAt! - t.alertAt) / 60000);
    const m = median(xs);
    return { shift, mins: m === undefined ? null : m, n: xs.length };
  });
}

export function frameStateCounts(s: MillState, now: number): Record<FrameStateKind, number> {
  const c: Record<FrameStateKind, number> = { running: 0, warning: 0, fault: 0, held: 0, stopped: 0 };
  for (const f of s.frames) c[frameView(s, f.id, now).kind] += 1;
  return c;
}

/** Yarn held per critical incident vs the old ~250 kg. */
/** Yarn made between the alert and the fix (the time QC Alert shortens), against the old ~250 kg per incident. */
export function yarnSaved(s: MillState, now: number, since: number) {
  const fixed = s.tickets.filter((t) => t.severity === 'critical' && t.createdAt >= since && t.createdAt <= now && t.fixedAt && t.closeReason !== 'sample_error');
  const made = fixed.map((t) => {
    const lot = s.lots.find((l) => l.id === t.lotId);
    const rate = s.products.find((p) => p.id === (lot?.productId ?? t.productId))?.kgPerHour ?? 30;
    return (rate * (t.fixedAt! - t.alertAt)) / HOUR;
  });
  const saved = made.reduce((sum, kg) => sum + Math.max(0, BASELINE_KG - kg), 0);
  return { incidents: fixed.length, saved, avgHeld: made.length ? made.reduce((a, b) => a + b, 0) / made.length : 0 };
}

export function ticketsSince(s: MillState, since: number, now: number) {
  return s.tickets.filter((t) => t.createdAt >= since && t.createdAt <= now);
}

export const sevOrder: Severity[] = ['critical', 'major', 'minor'];

/** Critical and major alerts by weekday (Mon first) and 3-hour block, over the last `days` days. */
export function alertHeat(s: MillState, now: number, days = 30): number[][] {
  const since = dayStart(now) - (days - 1) * DAY;
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => 0));
  for (const t of s.tickets) {
    if (t.severity === 'minor' || t.createdAt > now || t.createdAt < since) continue;
    const wd = (new Date(t.createdAt + 5.5 * 3600000).getUTCDay() + 6) % 7;
    grid[wd][Math.min(7, Math.floor(millHour(t.createdAt) / 3))] += 1;
  }
  return grid;
}
