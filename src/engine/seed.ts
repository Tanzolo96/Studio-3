// Seed: one mill, 24 ring frames, 4 products, Oct 2026 + the first days of Nov.
// History is replayed through the real reducer, so seeded tickets follow the same rules as live ones.

import type { Frame, Lot, MillEvent, MillEventInput, MillState, Product, Rule, Severity, TestKind, TestResult, User } from './types';
import { apply } from './reducer';
import { DAY, HOUR, MIN, mill, shiftAt } from './time';
import { TEST } from './vocab';

export const DEMO_START = mill('2026-11-05', '09:40');
const HISTORY_START = mill('2026-10-01');

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const USERS: User[] = [
  { id: 'krish', name: 'Krish Patel', role: 'supervisor', shift: 'B' },
  { id: 'vikram', name: 'Vikram Singh', role: 'supervisor', shift: 'A' },
  { id: 'anil', name: 'Anil Rathod', role: 'supervisor', shift: 'C' },
  { id: 'rohan', name: 'Rohan Desai', role: 'tester', shift: 'B' },
  { id: 'meena', name: 'Meena Joshi', role: 'tester', shift: 'A' },
  { id: 'deepak', name: 'Deepak Rao', role: 'tester', shift: 'C' },
  { id: 'suresh', name: 'Suresh Kumar', role: 'fitter', shift: 'B' },
  { id: 'imran', name: 'Imran Shaikh', role: 'fitter', shift: 'B' },
  { id: 'ramesh', name: 'Ramesh Yadav', role: 'fitter', shift: 'A' },
  { id: 'harish', name: 'Harish Mehta', role: 'fitter', shift: 'C' },
  { id: 'priya', name: 'Priya Shah', role: 'qc', shift: 'G' },
  { id: 'mohit', name: 'Mohit Maheshwari', role: 'plant', shift: 'G' },
];

const PRODUCTS: Product[] = [
  { id: 'p30', name: '30s combed, Buyer B', short: '30s', nominalNe: 30, kgPerHour: 30, cvWarnPct: 2.0 },
  { id: 'p40', name: '40s combed, Buyer A', short: '40s', nominalNe: 40, kgPerHour: 22, cvWarnPct: 2.0 },
  { id: 'p20', name: '20s carded, Buyer C', short: '20s', nominalNe: 20, kgPerHour: 42, cvWarnPct: 2.5 },
  { id: 'p60', name: '60s compact, Buyer A', short: '60s', nominalNe: 60, kgPerHour: 14, cvWarnPct: 1.8 },
];

const LOTS: Lot[] = [
  { id: '2411', productId: 'p20', startedAt: mill('2026-10-28') },
  { id: '2409', productId: 'p40', startedAt: mill('2026-10-26') },
  { id: '2416', productId: 'p30', startedAt: mill('2026-10-30') },
  { id: '2417', productId: 'p30', startedAt: mill('2026-11-02') },
  { id: '2420', productId: 'p20', startedAt: mill('2026-11-01') },
  { id: '2422', productId: 'p60', startedAt: mill('2026-10-29') },
];

function lotForFrame(n: number) {
  if (n <= 4) return '2411';
  if (n <= 8) return '2409';
  if (n <= 11) return '2416';
  if (n <= 14) return '2417';
  if (n <= 19) return '2420';
  return '2422';
}

const FRAMES: Frame[] = Array.from({ length: 24 }, (_, i) => {
  const num = i + 1;
  return { id: `RF-${String(num).padStart(2, '0')}`, num, lotId: lotForFrame(num), ...(num === 4 ? { stopped: 'Doffing' } : {}) };
});

const LIMITS: Record<string, Record<TestKind, [number | undefined, number | undefined, Severity]>> = {
  p30: { count: [29.4, 30.6, 'critical'], csp: [2200, undefined, 'major'], twist: [21, 23, 'minor'], cv: [undefined, 14.5, 'major'] },
  p40: { count: [39.2, 40.8, 'critical'], csp: [2300, undefined, 'major'], twist: [24, 26.5, 'minor'], cv: [undefined, 15.5, 'major'] },
  p20: { count: [19.6, 20.4, 'critical'], csp: [2000, undefined, 'major'], twist: [17, 19, 'minor'], cv: [undefined, 13.5, 'major'] },
  p60: { count: [59.0, 61.0, 'critical'], csp: [2500, undefined, 'major'], twist: [29, 32, 'minor'], cv: [undefined, 16.5, 'major'] },
};

const RULES: Rule[] = PRODUCTS.flatMap((p) =>
  (Object.keys(TEST) as TestKind[]).map((test) => {
    const [min, max, severity] = LIMITS[p.id][test];
    return {
      id: `${p.id}-${test}`,
      productId: p.id,
      test,
      min,
      max,
      severity,
      seenMins: 5,
      escalateQcMins: 10,
      escalatePhMins: 20,
      updatedAt: mill('2026-09-14', '11:20'),
      updatedBy: 'priya',
    };
  }),
);

const supervisorAt = (t: number) => ({ A: 'vikram', B: 'krish', C: 'anil' })[shiftAt(t)];
const testerAt = (t: number) => ({ A: 'meena', B: 'rohan', C: 'deepak' })[shiftAt(t)];
const fitterAt = (t: number) => ({ A: 'ramesh', B: 'suresh', C: 'harish' })[shiftAt(t)];

function baseResults(): TestResult[] {
  const rand = rng(2417);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const out: TestResult[] = [];
  let n = 0;
  const push = (at: number, frame: Frame, test: TestKind, value: number) => {
    n += 1;
    out.push({ id: `R-${n}`, at, frameId: frame.id, lotId: frame.lotId, test, value, pass: true, by: testerAt(at), instrument: TEST[test].instrument });
  };
  for (let day = HISTORY_START; day < DEMO_START; day += DAY) {
    for (const f of FRAMES) {
      const p = LOTS.find((l) => l.id === f.lotId)!.productId;
      const lim = LIMITS[p];
      const nom = PRODUCTS.find((x) => x.id === p)!.nominalNe;
      const off = (f.num % 6) * 2 * MIN + Math.floor((f.num - 1) / 6) * MIN;
      for (const slot of [0, 8, 16]) {
        const at = day + slot * HOUR + off;
        if (at > DEMO_START) continue;
        push(at, f, 'count', +(nom + gauss() * 0.16 * (nom / 30)).toFixed(1));
      }
      const daily = day + 10 * HOUR + off * 2;
      if (daily > DEMO_START) continue;
      push(daily, f, 'csp', Math.round(lim.csp[0]! + 260 + gauss() * 80));
      push(daily + 6 * MIN, f, 'twist', +((lim.twist[0]! + lim.twist[1]!) / 2 + gauss() * 0.4).toFixed(1));
      push(daily + 12 * MIN, f, 'cv', +(lim.cv[1]! - 1.6 + gauss() * 0.4).toFixed(1));
    }
  }
  return out;
}

export function baseState(): MillState {
  const results = baseResults();
  return {
    clock: { simAt: DEMO_START, realAt: 0, speed: 1 },
    users: USERS,
    products: PRODUCTS,
    lots: LOTS,
    frames: FRAMES,
    rules: RULES,
    results,
    requests: [],
    tickets: [],
    holds: [],
    drift: {},
    rovingChanges: [],
    seq: { ticket: 1010, hold: 300, request: 500, result: results.length },
  };
}

// ---------- history ----------
type Kind = TestKind | 'drift_ok' | 'drift_fail' | 'manual' | 'sample';
type Outcome = 'retest_release' | 'reprocess' | 'downgrade' | 'override' | 'open';
interface Incident {
  d: string;
  t: string;
  frame: string;
  kind: Kind;
  value?: number;
  seen: number; // minutes to Seen
  fix?: number; // minutes to Fixed
  cause?: string;
  outcome?: Outcome;
  roving?: boolean; // roving lot change ~90 min before
}

const HISTORY: Incident[] = [
  { d: '2026-10-01', t: '14:20', frame: 'RF-07', kind: 'drift_ok', value: 2.2, seen: 2 },
  { d: '2026-10-02', t: '09:10', frame: 'RF-17', kind: 'count', value: 19.4, seen: 3, fix: 55, cause: 'Wrong roving hank', outcome: 'reprocess' },
  { d: '2026-10-03', t: '10:42', frame: 'RF-12', kind: 'count', value: 28.9, seen: 4, fix: 62, cause: 'Draft setting slipped', outcome: 'reprocess', roving: true },
  { d: '2026-10-05', t: '21:30', frame: 'RF-03', kind: 'twist', value: 19.4, seen: 6, fix: 40, cause: 'Traveller or spindle fault' },
  { d: '2026-10-07', t: '03:15', frame: 'RF-22', kind: 'cv', value: 17.1, seen: 4, fix: 70, cause: 'Humidity out of range' },
  { d: '2026-10-08', t: '11:50', frame: 'RF-07', kind: 'drift_fail', value: 41.0, seen: 2, fix: 48, cause: 'Worn top roller or apron', outcome: 'retest_release' },
  { d: '2026-10-09', t: '18:15', frame: 'RF-12', kind: 'count', value: 29.1, seen: 3, fix: 51, cause: 'Draft setting slipped', outcome: 'retest_release', roving: true },
  { d: '2026-10-11', t: '16:45', frame: 'RF-15', kind: 'csp', value: 1910, seen: 5, fix: 35, cause: 'Other' },
  { d: '2026-10-13', t: '08:30', frame: 'RF-06', kind: 'count', value: 39.0, seen: 12, fix: 66, cause: 'Draft setting slipped', outcome: 'downgrade' },
  { d: '2026-10-14', t: '22:10', frame: 'RF-19', kind: 'twist', value: 16.8, seen: 8, fix: 30, cause: 'Traveller or spindle fault' },
  { d: '2026-10-15', t: '13:05', frame: 'RF-10', kind: 'sample', value: 29.2, seen: 3 },
  { d: '2026-10-16', t: '02:30', frame: 'RF-12', kind: 'count', value: 29.0, seen: 6, fix: 74, cause: 'Draft setting slipped', outcome: 'reprocess' },
  { d: '2026-10-18', t: '10:20', frame: 'RF-21', kind: 'count', value: 58.7, seen: 3, fix: 58, cause: 'Humidity out of range', outcome: 'reprocess' },
  { d: '2026-10-19', t: '06:40', frame: 'RF-02', kind: 'drift_ok', value: 2.7, seen: 4 },
  { d: '2026-10-20', t: '15:15', frame: 'RF-17', kind: 'count', value: 20.6, seen: 4, fix: 45, cause: 'Wrong roving hank', outcome: 'retest_release' },
  { d: '2026-10-21', t: '23:50', frame: 'RF-24', kind: 'cv', value: 16.9, seen: 22, fix: 80, cause: 'Worn top roller or apron' },
  { d: '2026-10-22', t: '11:05', frame: 'RF-12', kind: 'count', value: 30.9, seen: 2, fix: 40, cause: 'Roving lot changeover', outcome: 'retest_release', roving: true },
  { d: '2026-10-24', t: '12:30', frame: 'RF-07', kind: 'drift_ok', value: 2.1, seen: 3 },
  { d: '2026-10-25', t: '04:20', frame: 'RF-13', kind: 'csp', value: 2150, seen: 7, fix: 50, cause: 'Traveller or spindle fault' },
  { d: '2026-10-26', t: '17:55', frame: 'RF-09', kind: 'twist', value: 20.6, seen: 9, fix: 25, cause: 'Traveller or spindle fault' },
  { d: '2026-10-27', t: '09:35', frame: 'RF-17', kind: 'count', value: 19.5, seen: 2, fix: 38, cause: 'Draft setting slipped', outcome: 'override' },
  { d: '2026-10-28', t: '14:10', frame: 'RF-01', kind: 'manual', seen: 0, fix: 35, cause: 'Traveller or spindle fault' },
  { d: '2026-10-29', t: '19:40', frame: 'RF-12', kind: 'count', value: 29.2, seen: 3, fix: 57, cause: 'Draft setting slipped', outcome: 'reprocess', roving: true },
  { d: '2026-10-30', t: '01:25', frame: 'RF-23', kind: 'count', value: 61.3, seen: 11, fix: 64, cause: 'Traveller or spindle fault', outcome: 'downgrade' },
  { d: '2026-10-31', t: '11:15', frame: 'RF-05', kind: 'drift_fail', value: 39.1, seen: 3, fix: 52, cause: 'Draft setting slipped', outcome: 'retest_release' },
  { d: '2026-11-01', t: '20:05', frame: 'RF-16', kind: 'twist', value: 19.2, seen: 5, fix: 30, cause: 'Traveller or spindle fault' },
  { d: '2026-11-02', t: '10:50', frame: 'RF-08', kind: 'sample', value: 39.0, seen: 2 },
  { d: '2026-11-03', t: '09:10', frame: 'RF-17', kind: 'count', value: 19.4, seen: 3, fix: 110, cause: 'Wrong roving hank', outcome: 'open' },
  { d: '2026-11-04', t: '13:20', frame: 'RF-06', kind: 'count', value: 40.9, seen: 4, fix: 47, cause: 'Draft setting slipped', outcome: 'open' },
  { d: '2026-11-04', t: '22:30', frame: 'RF-11', kind: 'drift_ok', value: 2.3, seen: 5 },
  { d: '2026-11-05', t: '08:40', frame: 'RF-03', kind: 'twist', value: 19.3, seen: 12 },
];

let eid = 0;
function run(s: MillState, at: number, e: MillEventInput) {
  eid += 1;
  apply(s, { ...(e as object), id: `seed-${eid}`, at } as MillEvent);
}

function replay(s: MillState, inc: Incident) {
  const at = mill(inc.d, inc.t);
  const sup = supervisorAt(at);
  const tester = testerAt(at);
  const fitter = fitterAt(at);
  if (inc.roving) s.rovingChanges.push({ frameId: inc.frame, at: at - 95 * MIN });
  const last = () => s.tickets.at(-1)!;

  if (inc.kind === 'manual') {
    run(s, at, { type: 'ticket/raise', frameId: inc.frame, problem: 'Ends breaking often', severity: 'major', note: 'Breaks on spindles 210 to 240', by: sup });
  } else if (inc.kind === 'drift_ok' || inc.kind === 'drift_fail') {
    run(s, at, { type: 'sim/drift', frameId: inc.frame, cvPct: inc.kind === 'drift_ok' ? inc.value! : 2.6, by: 'system' });
    const t = last();
    run(s, at + inc.seen * MIN, { type: 'ticket/seen', ticketId: t.id, by: sup });
    const req = s.requests.find((r) => r.ticketId === t.id && r.status === 'pending')!;
    const nom = s.products.find((p) => p.id === t.productId)!.nominalNe;
    run(s, at + 22 * MIN, { type: 'result/enter', frameId: inc.frame, test: 'count', value: inc.kind === 'drift_ok' ? nom + 0.1 : inc.value!, requestId: req.id, by: tester });
    if (inc.kind === 'drift_ok') return;
    run(s, at + (22 + inc.seen) * MIN, { type: 'ticket/seen', ticketId: t.id, by: sup });
    finish(s, t.id, at + 22 * MIN, inc, sup, fitter, tester);
    return;
  } else if (inc.kind === 'sample') {
    run(s, at, { type: 'result/enter', frameId: inc.frame, test: 'count', value: inc.value!, by: tester });
    const t = last();
    run(s, at + inc.seen * MIN, { type: 'ticket/seen', ticketId: t.id, by: sup });
    const rid = t.readings[0].resultId!;
    run(s, at + 18 * MIN, { type: 'result/sampleError', resultId: rid, by: tester });
    return;
  } else {
    run(s, at, { type: 'result/enter', frameId: inc.frame, test: inc.kind, value: inc.value!, by: tester });
  }
  const t = last();
  if (inc.kind !== 'manual') run(s, at + inc.seen * MIN, { type: 'ticket/seen', ticketId: t.id, by: sup });
  if (inc.fix) finish(s, t.id, at, inc, sup, fitter, tester);
}

function answerSisters(s: MillState, ticketId: string, at: number, tester: string) {
  for (const r of s.requests.filter((q) => q.ticketId === ticketId && q.reason === 'sister' && q.status === 'pending')) {
    const nom = s.products.find((p) => p.id === s.lots.find((l) => l.id === s.frames.find((f) => f.id === r.frameId)!.lotId)!.productId)!.nominalNe;
    run(s, at, { type: 'result/enter', frameId: r.frameId, test: r.test, value: nom + 0.1, requestId: r.id, by: tester });
  }
}

function finish(s: MillState, ticketId: string, at: number, inc: Incident, sup: string, fitter: string, tester: string) {
  answerSisters(s, ticketId, at + 14 * MIN, tester);
  const fixAt = at + inc.fix! * MIN;
  run(s, at + (inc.seen + 2) * MIN, { type: 'ticket/working', ticketId, by: sup });
  run(s, at + (inc.seen + 4) * MIN, { type: 'ticket/assignFitter', ticketId, fitterId: fitter, by: sup });
  run(s, fixAt - 6 * MIN, { type: 'ticket/repairDone', ticketId, by: fitter });
  run(s, fixAt, { type: 'ticket/fixed', ticketId, cause: inc.cause!, by: sup });
  const t = s.tickets.find((x) => x.id === ticketId)!;
  const h = t.holdId ? s.holds.find((x) => x.id === t.holdId) : undefined;
  if (!h || !inc.outcome || inc.outcome === 'open') return;
  const d = fixAt + 40 * MIN;
  if (inc.outcome === 'retest_release') {
    run(s, d, { type: 'hold/retest', holdId: h.id, by: 'priya' });
    const req = s.requests.find((r) => r.holdId === h.id && r.status === 'pending')!;
    const nom = s.products.find((p) => p.id === t.productId)!.nominalNe;
    run(s, d + 25 * MIN, { type: 'result/enter', frameId: t.frameId, test: 'count', value: nom - 0.1, requestId: req.id, by: tester });
    run(s, d + 35 * MIN, { type: 'hold/decide', holdId: h.id, outcome: 'release', reason: 'Re-test passed on the held cones', by: 'priya' });
  } else if (inc.outcome === 'override') {
    run(s, d, { type: 'hold/decide', holdId: h.id, outcome: 'release', reason: 'Buyer C delivery due 28 Oct. Reading was 0.1 Ne outside, inside the buyer tolerance.', by: 'priya' });
    run(s, d + 50 * MIN, { type: 'hold/approve', holdId: h.id, by: 'mohit' });
  } else {
    run(s, d, {
      type: 'hold/decide',
      holdId: h.id,
      outcome: inc.outcome,
      reason: inc.outcome === 'reprocess' ? 'Too far outside the limit to sell to this buyer' : 'Sell as lower grade to the open market',
      by: 'priya',
    });
  }
}

let cached: MillState | undefined;

/** Fresh copy of the seeded mill at the demo start (05 Nov, 09:40, B shift). */
export function seedState(): MillState {
  if (!cached) {
    eid = 0;
    const s = baseState();
    for (const inc of HISTORY) replay(s, inc);
    s.rovingChanges.push({ frameId: 'RF-12', at: mill('2026-10-12', '15:00') });
    cached = s;
  }
  return structuredClone(cached);
}
