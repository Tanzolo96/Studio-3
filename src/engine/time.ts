import type { Clock, ShiftId } from './types';
import { SHIFTS } from './vocab';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Mill time is shown as Indian Standard Time regardless of the viewer's zone. */
const IST_OFFSET = 5.5 * HOUR;

/** Build an epoch ms from a mill-local date and time. */
export function mill(date: string, time = '00:00'): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET;
}

function parts(t: number) {
  const d = new Date(t + IST_OFFSET);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const hhmm = (t: number) => {
  const p = parts(t);
  return `${pad(p.h)}:${pad(p.mi)}`;
};
export const dayMonth = (t: number) => {
  const p = parts(t);
  return `${pad(p.d)} ${MONTHS[p.mo]}`;
};
export const dateTime = (t: number) => `${dayMonth(t)}, ${hhmm(t)}`;
export const monthName = (t: number) => {
  const p = parts(t);
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.mo];
};
export const millDayKey = (t: number) => {
  const p = parts(t);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`;
};
export const sameMillDay = (a: number, b: number) => millDayKey(a) === millDayKey(b);
export const millHour = (t: number) => parts(t).h + parts(t).mi / 60;

export function shiftAt(t: number): ShiftId {
  const h = parts(t).h;
  return (Object.keys(SHIFTS) as ShiftId[]).find((s) => {
    const { start, end } = SHIFTS[s];
    return start < end ? h >= start && h < end : h >= start || h < end;
  }) ?? 'A';
}

export function shiftEndsAt(t: number): number {
  const s = SHIFTS[shiftAt(t)];
  const dayStart = mill(millDayKey(t));
  const h = parts(t).h;
  // C shift runs over midnight: before midnight it ends tomorrow morning
  return dayStart + s.end * HOUR + (s.start > s.end && h >= s.start ? DAY : 0);
}

/** "1:12" style clock for timers (m:ss under an hour, h:mm:ss above). */
export function timer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "2 min", "1 h 05", "3 d" */
export function ago(ms: number): string {
  const m = Math.max(0, Math.floor(ms / MIN));
  if (m < 1) return 'now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${pad(m % 60)}` : `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** h:mm duration for tables ("0:12") */
export function hmm(ms: number): string {
  const m = Math.max(0, Math.floor(ms / MIN));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

export function nowFrom(c: Clock, wall = Date.now()): number {
  return c.simAt + (wall - c.realAt) * c.speed;
}
