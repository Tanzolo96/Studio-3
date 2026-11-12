// "AI" breakdown forecast for one ring frame. Rules, not a trained model: it reads the frame's
// fault history (cause recorded at fix time), its sister frames on the same lot, how close the
// latest lab readings sit to their limits, and the winding-sensor drift, then ranks the machine
// parts most likely to cause the next fault. Every number comes with the evidence behind it.
import type { MillState, TestKind } from './types';
import { productOfFrame, ruleFor } from './reducer';
import { TEST } from './vocab';

export type Part = 'creel' | 'drafting' | 'apron' | 'spindles' | 'environment';

export const PARTS: Record<Part, { name: string; how: string; causes: string[] }> = {
  creel: { name: 'Creel and roving', how: 'Wrong or mixed roving makes the yarn count drift', causes: ['Wrong roving hank', 'Roving lot changeover'] },
  drafting: { name: 'Drafting zone', how: 'The draft setting slips and the yarn comes out too thick or too fine', causes: ['Draft setting slipped'] },
  apron: { name: 'Top rollers and aprons', how: 'Worn cots and aprons make the yarn uneven (CV rises)', causes: ['Worn top roller or apron'] },
  spindles: { name: 'Spindles and travellers', how: 'Worn travellers raise end breaks and change the twist', causes: ['Traveller or spindle fault'] },
  environment: { name: 'Humidity around the frame', how: 'Humidity out of range weakens the yarn (CSP drops)', causes: ['Humidity out of range'] },
};

/** Which part a reading close to its limit points at. */
const TEST_PART: Record<TestKind, Part> = { count: 'drafting', csp: 'environment', twist: 'spindles', cv: 'apron' };

export interface PartRisk {
  part: Part;
  name: string;
  how: string;
  pct: number;
  evidence: string[];
}

export interface ReadingMargin {
  test: TestKind;
  value: number;
  min?: number;
  max?: number;
  /** 0 = on the limit (or outside), 1 = right in the middle of the band */
  margin: number;
  at: number;
}

export interface FramePrediction {
  frameId: string;
  risk: number;
  level: 'low' | 'watch' | 'high';
  horizon: string;
  parts: PartRisk[];
  readings: ReadingMargin[];
  faults90: number;
  health: number;
}

const DAY = 86_400_000;

export function predictFrame(s: MillState, frameId: string, now: number): FramePrediction {
  const frame = s.frames.find((f) => f.id === frameId)!;
  const product = productOfFrame(s, frameId);
  const since = now - 90 * DAY;
  const own = s.tickets.filter((t) => t.frameId === frameId && t.createdAt <= now && t.createdAt >= since);
  const mates = s.frames.filter((f) => f.lotId === frame.lotId && f.id !== frameId).map((f) => f.id);
  const mateTickets = s.tickets.filter((t) => mates.includes(t.frameId) && t.createdAt <= now && t.createdAt >= since);
  const withCause = own.filter((t) => t.cause);

  // latest valid reading per test, and how close it sits to its limits
  const readings: ReadingMargin[] = [];
  for (const test of Object.keys(TEST) as TestKind[]) {
    const r = s.results.filter((x) => x.frameId === frameId && x.test === test && !x.sampleError && x.at <= now).sort((a, b) => b.at - a.at)[0];
    if (!r) continue;
    const rule = ruleFor(s, product.id, test);
    let margin = 1;
    if (rule?.min !== undefined && rule?.max !== undefined) {
      const half = (rule.max - rule.min) / 2;
      margin = Math.max(0, Math.min(r.value - rule.min, rule.max - r.value) / half);
    } else if (rule?.min !== undefined) margin = Math.max(0, Math.min(1, (r.value - rule.min) / (Math.abs(rule.min) * 0.1 || 1)));
    else if (rule?.max !== undefined) margin = Math.max(0, Math.min(1, (rule.max - r.value) / (Math.abs(rule.max) * 0.1 || 1)));
    readings.push({ test, value: r.value, min: rule?.min, max: rule?.max, margin, at: r.at });
  }

  const drift = s.drift[frameId];
  const open = own.filter((t) => t.status !== 'closed' && t.status !== 'fixed');

  const parts: PartRisk[] = (Object.keys(PARTS) as Part[]).map((part) => {
    const def = PARTS[part];
    const evidence: string[] = [];
    let score = 4;
    const mine = withCause.filter((t) => def.causes.includes(t.cause!)).length;
    if (mine) {
      score += mine * 16;
      evidence.push(mine === withCause.length ? `${mine === 1 ? 'The last fixed fault' : `All ${mine} fixed faults`} on ${frameId} ${mine === 1 ? 'was' : 'were'} ${def.causes[0].toLowerCase()}` : `${mine} of the last ${withCause.length} fixed faults on ${frameId} were ${def.causes[0].toLowerCase()}`);
    }
    const mate = mateTickets.filter((t) => t.cause && def.causes.includes(t.cause)).length;
    if (mate) {
      score += mate * 6;
      evidence.push(`Sister frames on lot ${frame.lotId} had ${mate} fault${mate > 1 ? 's' : ''} from the same cause`);
    }
    for (const r of readings) {
      if (TEST_PART[r.test] !== part || r.margin >= 0.4) continue;
      const near = r.min !== undefined && Math.abs(r.value - r.min) <= Math.abs((r.max ?? r.value) - r.value) ? `lower limit ${r.min}` : `upper limit ${r.max}`;
      score += Math.round((0.4 - r.margin) * 70);
      evidence.push(`Last ${TEST[r.test].name.toLowerCase()} test ${r.value}${TEST[r.test].unit ? ' ' + TEST[r.test].unit : ''}, close to the ${near}`);
    }
    if (drift && (part === 'apron' || part === 'drafting') && drift.cvPct >= product.cvWarnPct * 0.6) {
      score += Math.round((drift.cvPct / product.cvWarnPct) * (part === 'apron' ? 18 : 10));
      evidence.push(`Winding sensor shows CV +${drift.cvPct.toFixed(1)}% (warning at +${product.cvWarnPct.toFixed(1)}%)`);
    }
    if (open.some((t) => t.cause ? def.causes.includes(t.cause) : TEST_PART[t.test ?? 'count'] === part)) {
      score += 12;
      evidence.push('There is an open ticket on this part right now');
    }
    if (!evidence.length) evidence.push('No warning signs in the last 90 days');
    return { part, name: def.name, how: def.how, pct: Math.min(88, Math.round(score)), evidence };
  });
  parts.sort((a, b) => b.pct - a.pct);

  // the weakest part sets the risk; the next one adds a little
  const risk = Math.min(95, Math.round(parts[0].pct + (parts[1]?.pct ?? 0) * 0.2));
  const level = risk >= 60 ? 'high' : risk >= 35 ? 'watch' : 'low';
  const horizon = level === 'high' ? 'Likely within 3 days' : level === 'watch' ? 'Possible within 2 weeks' : 'No sign of a fault soon';
  const health = Math.max(5, 100 - risk);
  return { frameId, risk, level, horizon, parts, readings, faults90: own.length, health };
}

export function predictAll(s: MillState, now: number): FramePrediction[] {
  return s.frames.map((f) => predictFrame(s, f.id, now)).sort((a, b) => b.risk - a.risk);
}
