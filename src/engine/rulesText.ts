// Rules as plain sentences, both ways:
//  - rulesAsText: the current rules written out, for people and for an AI to read.
//  - readRules: rules found in a document's text (a dropped PDF), each with what it would change.
// No AI service: simple patterns for the kinds of rule a mill writes down. Anything else is kept as a note.
import type { MillState, SetLimit, Severity, TestKind } from './types';
import { TEST } from './vocab';

export interface Routing {
  backupMins: number;
  qcMins: number;
  plantMins: number;
}

export function currentRouting(s: MillState): Routing {
  const r = s.rules[0];
  return { backupMins: r?.seenMins ?? 5, qcMins: r?.escalateQcMins ?? 10, plantMins: r?.escalatePhMins ?? 20 };
}

/** Every rule QC Alert follows, as one sentence each. */
export function rulesAsText(s: MillState): string[] {
  const r = currentRouting(s);
  const out = [
    'When the lab reports a failed test, QC Alert alerts the shift supervisor who looks after that frame on their phone. Critical alerts ring with sound; minor ones show only on the dashboard.',
    `If nobody taps "I'm fixing it" within ${r.backupMins} minutes, QC Alert also alerts the backup supervisor on the same shift.`,
    `If nobody taps "I'm fixing it" within ${r.qcMins} minutes, QC Alert alerts the QC manager.`,
    `If nobody taps "I'm fixing it" within ${r.plantMins} minutes, QC Alert alerts and calls the plant head.`,
    `The first person to tap "I'm fixing it" owns the alert; the fixing time starts then.`,
    'When the frame is fixed, the person fixing it sends a fix report: which part of the machine, the cause, an optional note and photo.',
    'After a fix report, the lab re-tests the frame. A pass closes the alert; a fail reopens it and alerts the supervisor again.',
    'A second failed test on the same frame and test while the alert is open is added to the same alert, without a new alarm.',
    'Waiting for a spare part pauses the timer, with the part named.',
  ];
  for (const p of s.products) {
    for (const rule of s.rules.filter((x) => x.productId === p.id)) {
      const t = TEST[rule.test];
      const unit = t.unit ? ` ${t.unit}` : '';
      const range =
        rule.min !== undefined && rule.max !== undefined
          ? `between ${rule.min} and ${rule.max}${unit}`
          : rule.min !== undefined
            ? `at least ${rule.min}${unit}`
            : `at most ${rule.max}${unit}`;
      out.push(`${p.name}: ${t.name.toLowerCase()} must be ${range}. Outside it is ${rule.severity}.`);
    }
  }
  return out;
}

export type FoundKind = 'routing' | 'limit' | 'builtin' | 'note';
export interface FoundRule {
  text: string; // the line as written in the document
  kind: FoundKind;
  /** What QC Alert understood, in plain words. */
  meaning: string;
  routing?: Partial<Routing>;
  limit?: { ruleId: string; min?: number; max?: number; severity?: Severity };
}

const TESTS: [RegExp, TestKind][] = [
  [/\b(count|ne)\b/i, 'count'],
  [/\b(csp|strength)\b/i, 'csp'],
  [/\b(twist|tpi)\b/i, 'twist'],
  [/\b(cv|unevenness|evenness)\b/i, 'cv'],
];
const NUM = String.raw`(\d+(?:\.\d+)?)`;

function minutes(line: string) {
  const m = line.match(new RegExp(`${NUM}\\s*(?:min|minutes|mins)\\b`, 'i'));
  return m ? Number(m[1]) : undefined;
}

/** Split a document's text into candidate rule lines. */
export function ruleLines(text: string): string[] {
  const parts = text
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.;])\s+(?=(?:\d+[.)]\s)|[A-Z])/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // A short fragment ("Critical.") belongs to the sentence before it.
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && p.split(' ').length <= 2 && /[.!]$/.test(p)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.filter((l) => l.length > 8);
}

/** Read rules from a document's text. Each line becomes one found rule. */
export function readRules(text: string, s: MillState): FoundRule[] {
  const out: FoundRule[] = [];
  for (const line of ruleLines(text)) {
    const mins = minutes(line);
    // Routing: who gets told after how long.
    if (mins !== undefined && /(nobody|no one|no answer|not answered|not seen|within|after)/i.test(line)) {
      if (/backup|second supervisor|other supervisor|stand-?by/i.test(line)) {
        out.push({ text: line, kind: 'routing', meaning: `Backup supervisor alerted after ${mins} min`, routing: { backupMins: mins } });
        continue;
      }
      if (/qc manager|quality manager|qc head|quality head/i.test(line)) {
        out.push({ text: line, kind: 'routing', meaning: `QC manager alerted after ${mins} min`, routing: { qcMins: mins } });
        continue;
      }
      if (/plant head|plant manager|general manager|works manager/i.test(line)) {
        out.push({ text: line, kind: 'routing', meaning: `Plant head alerted after ${mins} min`, routing: { plantMins: mins } });
        continue;
      }
    }
    // Limits: "30s count must stay between 29.5 and 30.5 Ne. Critical."
    const prod = line.match(/\b(\d{2})s\b/i);
    const testHit = TESTS.find(([re]) => re.test(line));
    if (prod && testHit) {
      const product = s.products.find((p) => p.short === `${prod[1]}s`);
      const rule = product && s.rules.find((r) => r.productId === product.id && r.test === testHit[1]);
      const range = line.match(new RegExp(`${NUM}\\s*(?:to|-|–|and)\\s*${NUM}`, 'i'));
      const lo = line.match(new RegExp(`(?:min(?:imum)?|at least|not below|no less than)\\s*(?:of\\s*)?${NUM}`, 'i'));
      const hi = line.match(new RegExp(`(?:max(?:imum)?|at most|not above|no more than)\\s*(?:of\\s*)?${NUM}`, 'i'));
      const severity = (['critical', 'major', 'minor'] as Severity[]).find((w) => new RegExp(`\\b${w}\\b`, 'i').test(line));
      let min: number | undefined;
      let max: number | undefined;
      if (range && !/\d{2}s\b/.test(range[0])) {
        min = Number(range[1]);
        max = Number(range[2]);
      } else {
        min = lo ? Number(lo[1]) : undefined;
        max = hi ? Number(hi[1]) : undefined;
      }
      if (rule && (min !== undefined || max !== undefined) && (min === undefined || max === undefined || min < max)) {
        const t = TEST[testHit[1]];
        const r2 = min !== undefined && max !== undefined ? `${min} to ${max}` : min !== undefined ? `at least ${min}` : `at most ${max}`;
        out.push({
          text: line,
          kind: 'limit',
          meaning: `${product!.name}: ${t.name.toLowerCase()} ${r2}${t.unit ? ` ${t.unit}` : ''}${severity ? `, ${severity}` : ''}`,
          limit: { ruleId: rule.id, min, max, severity },
        });
        continue;
      }
    }
    // Rules QC Alert already follows.
    if (/re-?test/i.test(line) && /fix|clos/i.test(line)) {
      out.push({ text: line, kind: 'builtin', meaning: 'Already how QC Alert works: a re-test confirms every fix' });
      continue;
    }
    if (/part/i.test(line) && /(fitter|repair|fix)/i.test(line)) {
      out.push({ text: line, kind: 'builtin', meaning: 'Already how QC Alert works: the fix report asks which part' });
      continue;
    }
    if (/supervisor/i.test(line) && /(at once|immediately|straight away|first)/i.test(line)) {
      out.push({ text: line, kind: 'builtin', meaning: 'Already how QC Alert works: the frame’s supervisor is alerted first' });
      continue;
    }
    if (/\d/.test(line) || /\b(must|should|always|never|shall|keep|do not|don.t)\b/i.test(line)) {
      out.push({ text: line, kind: 'note', meaning: 'Not understood automatically. Kept with the document for people to read.' });
    }
  }
  return out;
}

/** Merge found routing changes into the current chain; null if the result is not a valid chain. */
export function mergedRouting(current: Routing, found: FoundRule[]): Routing | null {
  const next = { ...current };
  for (const f of found) Object.assign(next, f.routing ?? {});
  return next.backupMins < next.qcMins && next.qcMins < next.plantMins ? next : null;
}

// ---------- Rule sets: one yarn for one buyer, with a limit per test ----------
export interface FoundSet {
  yarn: string; // "40s combed"
  buyer: string; // "Buyer A"
  limits: SetLimit[];
  /** Lines of the file this set was read from. */
  lines: string[];
}

const SEVS: Severity[] = ['critical', 'major', 'minor'];
const testOf = (x: string): TestKind | undefined => TESTS.find(([re]) => re.test(x))?.[1];
const num = (x: string | undefined) => {
  if (x === undefined) return undefined;
  const v = x.replace(/[^\d.\-]/g, '');
  return v === '' || v === '-' ? undefined : Number(v);
};

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if ((ch === ',' || ch === ';' || ch === '\t') && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function addLimit(sets: FoundSet[], yarn: string, buyer: string, limit: SetLimit | undefined, line: string) {
  if (!yarn || !buyer) return;
  let set = sets.find((x) => x.yarn.toLowerCase() === yarn.toLowerCase() && x.buyer.toLowerCase() === buyer.toLowerCase());
  if (!set) sets.push((set = { yarn, buyer, limits: [], lines: [] }));
  set.lines.push(line);
  if (limit && (limit.min === undefined || limit.max === undefined || limit.min < limit.max)) {
    set.limits = set.limits.filter((l) => l.test !== limit.test);
    set.limits.push(limit);
  }
}

/** Is this text a table (CSV, or rows pasted from Excel)? */
export function looksLikeTable(text: string) {
  const head = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  return /[,;\t]/.test(head) && /test/i.test(head) && /(yarn|count|product|quality)/i.test(head);
}

/** Rule sets from a table: yarn, buyer, test, lower, upper, severity. One row per limit. */
export function readSetsFromTable(text: string): FoundSet[] {
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) return [];
  const head = splitCsv(rows[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const c = { yarn: col('yarn', 'product', 'quality', 'count'), buyer: col('buyer', 'customer', 'client'), test: col('test'), lo: col('lower', 'min'), hi: col('upper', 'max'), sev: col('severity', 'level') };
  if (c.yarn < 0 || c.test < 0) return [];
  const sets: FoundSet[] = [];
  for (const row of rows.slice(1)) {
    const v = splitCsv(row);
    const test = testOf(v[c.test] ?? '');
    const yarn = v[c.yarn] ?? '';
    const buyer = c.buyer >= 0 ? v[c.buyer] ?? '' : 'Any buyer';
    if (!test) continue;
    const severity = SEVS.find((w) => (v[c.sev] ?? '').toLowerCase().includes(w)) ?? 'major';
    const min = c.lo >= 0 ? num(v[c.lo]) : undefined;
    const max = c.hi >= 0 ? num(v[c.hi]) : undefined;
    addLimit(sets, yarn, buyer, min === undefined && max === undefined ? undefined : { test, min, max, severity }, row);
  }
  return sets.filter((x) => x.limits.length);
}

/** Rule sets written as text: a heading line "Rule set: 40s combed, Buyer A", then one line per test. */
export function readSetsFromText(text: string): { sets: FoundSet[]; rest: string } {
  const sets: FoundSet[] = [];
  const rest: string[] = [];
  let cur: { yarn: string; buyer: string } | null = null;
  for (const raw of text.replace(/\r/g, '').split(/\n+/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const h = line.match(/^(?:rule set|yarn)\s*[:\-–]\s*(.+?)\s*(?:,|for|–|-)\s*((?:buyer|customer|client)\b.*?)\.?$/i);
    if (h) {
      cur = { yarn: h[1].trim(), buyer: h[2].trim() };
      continue;
    }
    if (/^(?:end of (?:rule )?set|general rules|alert rules)/i.test(line)) {
      cur = null;
      rest.push(line);
      continue;
    }
    const test = cur ? testOf(line.split(/[:=]/)[0]) ?? testOf(line) : undefined;
    if (cur && test) {
      const range = line.match(new RegExp(`${NUM}\\s*(?:to|-|–|and)\\s*${NUM}`, 'i'));
      const lo = line.match(new RegExp(`(?:min(?:imum)?|at least|not below|no less than)\\s*(?:of\\s*)?${NUM}`, 'i'));
      const hi = line.match(new RegExp(`(?:max(?:imum)?|at most|not above|no more than)\\s*(?:of\\s*)?${NUM}`, 'i'));
      const min = range ? Number(range[1]) : lo ? Number(lo[1]) : undefined;
      const max = range ? Number(range[2]) : hi ? Number(hi[1]) : undefined;
      const severity = SEVS.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(line)) ?? 'major';
      if (min !== undefined || max !== undefined) {
        addLimit(sets, cur.yarn, cur.buyer, { test, min, max, severity }, line);
        continue;
      }
    }
    rest.push(line);
  }
  return { sets: sets.filter((x) => x.limits.length), rest: rest.join('\n') };
}

/** Read a dropped file's text: rule sets, plus any alert-chain rules and notes outside them. */
export function readDocument(text: string, s: MillState): { sets: FoundSet[]; rules: FoundRule[] } {
  if (looksLikeTable(text)) return { sets: readSetsFromTable(text), rules: [] };
  const { sets, rest } = readSetsFromText(text);
  return { sets, rules: readRules(rest, s) };
}
