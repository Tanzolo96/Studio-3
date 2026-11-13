import type { Severity, ShiftId, TestKind, TicketStatus } from './types';

export const TEST: Record<TestKind, { name: string; unit: string; decimals: number; instrument: string; tooLow: string; tooHigh: string }> = {
  count: { name: 'Count', unit: 'Ne', decimals: 1, instrument: 'MAG wrap reel + balance', tooLow: 'Too thick', tooHigh: 'Too fine' },
  csp: { name: 'CSP', unit: '', decimals: 0, instrument: 'Statex CSP tester', tooLow: 'Too weak', tooHigh: 'Above limit' },
  twist: { name: 'Twist', unit: 'TPI', decimals: 1, instrument: 'Statex twist tester', tooLow: 'Twist too low', tooHigh: 'Twist too high' },
  cv: { name: 'Unevenness', unit: 'CV%', decimals: 1, instrument: 'Premier TurboMaxx7', tooLow: 'Below limit', tooHigh: 'Too uneven' },
};

export const SEVERITY: Record<Severity, { word: string; rank: number }> = {
  critical: { word: 'Critical', rank: 0 },
  major: { word: 'Major', rank: 1 },
  minor: { word: 'Minor', rank: 2 },
};

export const STATUS_WORD: Record<TicketStatus, string> = {
  open: 'Open',
  seen: 'Seen',
  working: 'Working on it',
  fixed: 'Fixed',
  closed: 'Closed',
};

/** Mill shifts. C runs over midnight (22:00 to 06:00). */
export const SHIFTS: Record<ShiftId, { start: number; end: number; hours: string }> = {
  A: { start: 6, end: 14, hours: '06:00–14:00' },
  B: { start: 14, end: 22, hours: '14:00–22:00' },
  C: { start: 22, end: 6, hours: '22:00–06:00' },
};

/** Four plain causes plus "No cause found", which opens a root-cause check. */
export const CAUSES = ['Machine', 'Setting', 'Material', 'Other', 'No cause found'] as const;
export const CAUSE_HINT: Record<(typeof CAUSES)[number], string> = {
  Machine: 'Worn roller or apron, spindle, traveller',
  Setting: 'Draft or twist setting slipped',
  Material: 'Wrong or bad roving, lot change',
  Other: 'Humidity, handling, anything else',
  'No cause found': 'Opens a root-cause check',
};

export const RAISE_PROBLEMS = [
  'Ends breaking often',
  'Yarn looks thick or uneven',
  'Machine noise or vibration',
  'Wrong roving on creel',
  'Cops look soft or badly built',
  'Something else',
] as const;

export const OUTCOME_WORD = {
  release: 'Release',
  retest: 'Re-test',
  reprocess: 'Reprocess',
  downgrade: 'Sell as lower grade',
} as const;

/** Where each piece of a frame's data comes from. One list for every brand, so the dashboard never cares which make a frame is. */
export interface DataSource {
  what: string;
  from: string;
  how: 'Live feed' | 'Hourly export' | 'Typed on the phone' | 'Tapped on the phone' | 'Daily plan';
}

const STATUS_SOURCE: Record<string, DataSource> = {
  'LMW LR 9 AX': { what: 'Running or stopped', from: 'Motor current clamp fitted by the mill (same kit on any brand)', how: 'Live feed' },
  'Rieter G 38': { what: 'Running, speed, end breaks', from: 'Rieter SPIDERweb, read by a small translator', how: 'Hourly export' },
  'Toyota RX 300': { what: 'Running or stopped', from: 'Supervisor taps doffing and stops (no data link on this make)', how: 'Tapped on the phone' },
};

export function frameSources(make: string): DataSource[] {
  return [
    STATUS_SOURCE[make] ?? { what: 'Running or stopped', from: 'Supervisor taps doffing and stops', how: 'Tapped on the phone' },
    { what: 'Count, CSP, twist, CV', from: `${TEST.count.instrument}, ${TEST.csp.instrument}, ${TEST.twist.instrument}, ${TEST.cv.instrument}`, how: 'Typed on the phone' },
    { what: 'Yarn evenness (early warning)', from: 'Uster Quantum 3 yarn clearer on the winding machine. Cops traced back to this frame by tube colour, about 1 to 3 hours after spinning', how: 'Live feed' },
    { what: 'Fault causes', from: 'Picked by the supervisor when a fault is fixed', how: 'Tapped on the phone' },
    { what: 'Lot and yarn count', from: 'Planning office', how: 'Daily plan' },
  ];
}

export const MAKES = ['LMW LR 9 AX', 'Rieter G 38', 'Toyota RX 300'] as const;

/** If a feed goes quiet, the routine lab tests every 8 hours still run, so no frame goes unchecked. */
export const OFFLINE_NOTE = 'If a feed goes offline, the routine lab tests every 8 hours still run, so no frame goes unchecked.';
