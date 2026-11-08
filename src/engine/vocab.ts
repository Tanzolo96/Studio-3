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

export const SHIFTS: Record<ShiftId, { start: number; end: number }> = {
  A: { start: 0, end: 8 },
  B: { start: 8, end: 16 },
  C: { start: 16, end: 24 },
};

export const CAUSES = [
  'Draft setting slipped',
  'Wrong roving hank',
  'Worn top roller or apron',
  'Traveller or spindle fault',
  'Humidity out of range',
  'Roving lot changeover',
  'Other',
] as const;

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
