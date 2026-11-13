import { describe, expect, it } from 'vitest';
import { apply } from '../src/engine/reducer';
import { DEMO_START, seedState } from '../src/engine/seed';
import { escalation, frameView, messagesFor, myTickets, openHolds, pendingRequests, takeoversFor, waitingOn } from '../src/engine/selectors';
import { MIN } from '../src/engine/time';
import { alertHeat } from '../src/engine/analytics';
import { predictAll, predictFrame } from '../src/engine/predict';
import { plantCases } from '../src/engine/plant';
import { currentRouting, mergedRouting, readRules, rulesAsText } from '../src/engine/rulesText';
import type { MillEvent, MillEventInput, MillState } from '../src/engine/types';

let n = 0;
const run = (s: MillState, at: number, e: MillEventInput) => apply(s, { ...(e as object), id: `t${++n}`, at } as MillEvent);
const user = (s: MillState, id: string) => s.users.find((u) => u.id === id)!;

describe('seed', () => {
  it('has a month of history and a calm start', () => {
    const s = seedState();
    expect(s.tickets.length).toBeGreaterThanOrEqual(25);
    expect(s.frames).toHaveLength(24);
    expect(s.tickets.filter((t) => t.status !== 'closed' && t.severity !== 'minor' && t.status !== 'fixed')).toHaveLength(0);
    expect(openHolds(s)).toHaveLength(0); // no held yarn in the app any more
    expect(s.tickets.filter((t) => t.status === 'fixed')).toHaveLength(0);
    expect(frameView(s, 'RF-12', DEMO_START).kind).toBe('running');
    expect(frameView(s, 'RF-04', DEMO_START).kind).toBe('stopped');
  });
  it('RF-12 failed count 5 times in October', () => {
    const s = seedState();
    expect(s.tickets.filter((t) => t.frameId === 'RF-12' && t.test === 'count').length).toBe(5);
  });
});

describe('workflow v2: alert -> Fixing -> Fixed + report -> re-test', () => {
  it('runs the whole loop and logs every message', () => {
    const s = seedState();
    const t0 = DEMO_START + 15 * MIN;
    run(s, t0, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    expect(t.severity).toBe('critical');
    expect(t.holdId).toBeUndefined(); // no held yarn
    expect(s.holds).toHaveLength(0);
    // Alert goes to the frame's own supervisor, then the backup at 5, QC at 10, plant head at 20.
    expect(takeoversFor(s, user(s, 'krish'), t0).map((x) => x.id)).toContain(t.id);
    expect(takeoversFor(s, user(s, 'farhan'), t0)).toHaveLength(0);
    expect(takeoversFor(s, user(s, 'farhan'), t0 + 6 * MIN).map((x) => x.id)).toContain(t.id);
    expect(waitingOn(s, t, t0 + 11 * MIN)).toBe('QC manager');
    // Fixing: the tap that stops the escalation and starts the fixing time.
    const fixing = t0 + 12 * MIN;
    run(s, fixing, { type: 'ticket/working', ticketId: t.id, by: 'krish' });
    expect(t.seenAt).toBe(fixing);
    expect(t.workingAt).toBe(fixing);
    expect(escalation(t, fixing + 30 * MIN).level).toBe(1); // frozen where it was
    expect(waitingOn(s, t, fixing)).toBe('Krish is fixing');
    // Fixed with the report: cause and machine part.
    run(s, fixing + 25 * MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Setting', part: 'Drafting zone', note: 'Back roller setting reset', by: 'krish' });
    expect(t.status).toBe('fixed');
    expect(t.part).toBe('Drafting zone');
    const rq = s.requests.find((r) => r.ticketId === t.id && r.reason === 'retest' && r.status === 'pending')!;
    expect(rq).toBeTruthy();
    // Re-test passes: closes straight away (nothing held to decide).
    run(s, fixing + 40 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 30.0, requestId: rq.id, by: 'rohan' });
    expect(t.status).toBe('closed');
    const msgs = messagesFor(s, t, fixing + 41 * MIN);
    const text = msgs.map((m) => `${m.dir} ${m.who} ${m.text}`).join('\n');
    expect(text).toContain('Krish Patel, supervisor');
    expect(text).toContain('backup supervisor');
    expect(text).toContain('QC manager');
    expect(text).toContain('Fixing it');
    expect(text).toContain('Re-test Frame 12');
    expect(msgs.map((m) => m.at)).toEqual([...msgs.map((m) => m.at)].sort((x, y) => x - y));
  });

  it('a failed re-test reopens the ticket and alerts again', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'ticket/working', ticketId: t.id, by: 'krish' });
    run(s, DEMO_START + 30 * MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Machine', part: 'Top rollers and aprons', by: 'krish' });
    const rq = s.requests.find((r) => r.ticketId === t.id && r.reason === 'retest' && r.status === 'pending')!;
    run(s, DEMO_START + 50 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.7, requestId: rq.id, by: 'rohan' });
    expect(t.status).toBe('open');
    expect(t.reopened).toBe(1);
    expect(takeoversFor(s, user(s, 'krish'), DEMO_START + 51 * MIN).map((x) => x.id)).toContain(t.id);
  });

  it('sample error closes as a false alarm', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + 8 * MIN, { type: 'result/sampleError', resultId: t.readings[0].resultId!, by: 'rohan' });
    expect(t.closeReason).toBe('sample_error');
  });

  it('routing rules set the backup, QC and plant head times for every rule, and bad chains are ignored', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'routing/set', backupMins: 3, qcMins: 8, plantMins: 15, by: 'priya' });
    expect(s.rules.every((r) => r.seenMins === 3 && r.escalateQcMins === 8 && r.escalatePhMins === 15)).toBe(true);
    run(s, DEMO_START, { type: 'routing/set', backupMins: 10, qcMins: 5, plantMins: 15, by: 'priya' });
    expect(s.rules[0].seenMins).toBe(3);
    run(s, DEMO_START + MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    expect(escalation(t, DEMO_START + 10 * MIN).level).toBe(1);
  });

  it('records a rules document and what was read from it', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'rules/doc', name: 'QC rules 2026.pdf', pages: 2, found: ['If nobody answers in 5 minutes, alert the backup supervisor.'], applied: 1, by: 'priya' });
    expect(s.rulesDocs).toHaveLength(1);
    expect(s.rulesDocs[0].found[0]).toContain('backup');
  });

  it('the seed history follows the rules: every closed fix was confirmed by a re-test, nothing held', () => {
    const s = seedState();
    const fixed = s.tickets.filter((t) => t.status === 'closed' && t.closeReason === 'fixed' && t.test);
    expect(fixed.length).toBeGreaterThan(10);
    expect(fixed.every((t) => t.fixConfirmedAt && t.part)).toBe(true);
    expect(s.tickets.some((t) => t.kind === 'drift')).toBe(false);
  });
});

describe('alert heat map', () => {
  it('counts every critical and major ticket in the window once', () => {
    const s = seedState();
    const grid = alertHeat(s, DEMO_START, 30);
    const total = grid.flat().reduce((a, b) => a + b, 0);
    const first = DEMO_START - 30 * 24 * 60 * MIN;
    const expected = s.tickets.filter((t) => t.severity !== 'minor' && t.createdAt <= DEMO_START && t.createdAt >= first).length;
    expect(grid).toHaveLength(7);
    expect(total).toBeLessThanOrEqual(expected);
    expect(total).toBeGreaterThan(0);
  });
});

describe('ask for a test now', () => {
  it('adds one urgent lab request and does not duplicate it', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'ticket/raise', frameId: 'RF-05', problem: 'Yarn looks uneven', severity: 'major', by: 'krish' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'test/ask', ticketId: t.id, test: 'count', by: 'krish' } as never);
    run(s, DEMO_START + 2 * MIN, { type: 'test/ask', ticketId: t.id, test: 'count', by: 'krish' } as never);
    const asked = s.requests.filter((r) => r.ticketId === t.id && r.reason === 'manual' && r.status === 'pending');
    expect(asked).toHaveLength(1);
    expect(asked[0].urgent).toBe(true);
  });
});

describe('breakdown forecast', () => {
  it('ranks a frame with repeat draft faults as risky at the drafting zone', () => {
    const s = seedState();
    const p = predictFrame(s, 'RF-12', DEMO_START);
    expect(p.parts[0].part).toBe('drafting');
    expect(p.parts[0].evidence.join(' ')).toMatch(/draft setting slipped/);
    expect(p.risk).toBeGreaterThan(predictFrame(s, 'RF-01', DEMO_START).risk);
  });
  it('gives every frame a risk between 0 and 95 with evidence', () => {
    const all = predictAll(seedState(), DEMO_START);
    expect(all).toHaveLength(24);
    for (const p of all) {
      expect(p.risk).toBeGreaterThanOrEqual(0);
      expect(p.risk).toBeLessThanOrEqual(95);
      expect(p.parts.every((x) => x.evidence.length > 0)).toBe(true);
    }
  });
});

describe('rules', () => {
  it('QC manager can change a limit, and a bad range is ignored', () => {
    const s = seedState();
    const r = s.rules[0];
    run(s, DEMO_START, { type: 'rule/set', ruleId: r.id, min: 10, max: 20, severity: 'major', escalateQcMins: 12, escalatePhMins: 25, by: 'priya' } as never);
    expect(r.min).toBe(10);
    expect(r.max).toBe(20);
    expect(r.severity).toBe('major');
    expect(r.updatedBy).toBe('priya');
    run(s, DEMO_START + MIN, { type: 'rule/set', ruleId: r.id, min: 30, max: 20, severity: 'minor', escalateQcMins: 5, escalatePhMins: 9, by: 'priya' } as never);
    expect(r.min).toBe(10);
  });
});

describe('who owns an alert', () => {
  it('routes a frame to the supervisor who looks after it, and the operator sees his frames', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    expect(t.events.some((e) => e.text.includes('Krish Patel'))).toBe(true);
    expect(takeoversFor(s, user(s, 'krish'), DEMO_START).map((x) => x.id)).toContain(t.id);
    expect(takeoversFor(s, user(s, 'farhan'), DEMO_START).map((x) => x.id)).not.toContain(t.id);
    expect(myTickets(s, user(s, 'ramesh'), DEMO_START).map((x) => x.id)).toContain(t.id);
  });
  it('a ticket raised by the operator alerts his supervisor', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'ticket/raise', frameId: 'RF-07', problem: 'Ends breaking often', severity: 'major', by: 'ramesh' });
    const t = s.tickets.at(-1)!;
    expect(t.status).toBe('open');
    expect(t.raisedBy).toBe('ramesh');
    expect(takeoversFor(s, user(s, 'krish'), DEMO_START).map((x) => x.id)).toContain(t.id);
  });
});

describe('exceptions', () => {
  it('waiting for a spare part is logged and cleared when it arrives or the frame is fixed', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + 3 * MIN, { type: 'ticket/waitPart', ticketId: t.id, part: 'Top roller cots', by: 'krish' });
    expect(t.waitingPart).toBe('Top roller cots');
    expect(t.status).toBe('working');
    expect(escalation(t, DEMO_START + 60 * MIN).level).toBe(0);
    run(s, DEMO_START + 40 * MIN, { type: 'ticket/partArrived', ticketId: t.id, by: 'krish' });
    expect(t.waitingPart).toBeUndefined();
  });
  it('fixed with no cause found opens a root-cause check', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + 30 * MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'No cause found', by: 'krish' });
    expect(t.rca).toBe(true);
  });
  it('the lab queue puts the riskiest test first', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const crit = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'result/enter', frameId: 'RF-20', test: 'twist', value: 28.5, by: 'rohan' });
    run(s, DEMO_START + 2 * MIN, { type: 'test/ask', ticketId: s.tickets.at(-1)!.id, test: 'twist', by: 'krish' });
    run(s, DEMO_START + 3 * MIN, { type: 'ticket/sisters', ticketId: crit.id, frameIds: ['RF-13'], by: 'krish' });
    const q = pendingRequests(s);
    expect(q[0].reason).toBe('sister');
    expect(s.tickets.find((x) => x.id === q[0].ticketId)!.severity).toBe('critical');
  });
});

describe('plant head decisions', () => {

  it('starts with the two repeat frames waiting and knows each lot\'s buyer and dispatch', () => {
    const s = seedState();
    const cases = plantCases(s, DEMO_START);
    expect(cases.map((c) => c.id)).toEqual(['RF-12', 'RF-17']);
    const rf12 = cases[0];
    expect(rf12.kind === 'frame' && rf12.afterRoving).toBeGreaterThanOrEqual(3);
    expect(s.lots.find((l) => l.id === '2417')!.dispatchAt).toBeGreaterThan(DEMO_START);
    expect(s.products.find((p) => p.id === 'p30')!.buyer).toBe('Buyer B');
  });



  it('a frame decision clears the case until the frame fails again', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'frame/decide', frameId: 'RF-12', outcome: 'procedure', reason: 'Check draft after every roving change', by: 'mohit' });
    expect(plantCases(s, DEMO_START + MIN).map((c) => c.id)).toEqual(['RF-17']);
    run(s, DEMO_START + 2 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    expect(plantCases(s, DEMO_START + 3 * MIN).some((c) => c.id === 'RF-12')).toBe(true);
  });

});

describe('fitter needs parts', () => {
  it('marks the job waiting and clears it when the repair is done', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'ticket/seen', ticketId: t.id, by: 'krish' });
    run(s, DEMO_START + 2 * MIN, { type: 'ticket/working', ticketId: t.id, by: 'krish' });
    run(s, DEMO_START + 3 * MIN, { type: 'ticket/assignFitter', ticketId: t.id, fitterId: 'suresh', by: 'krish' });
    run(s, DEMO_START + 4 * MIN, { type: 'ticket/needsParts', ticketId: t.id, note: 'Top roller cot from store', by: 'suresh' });
    expect(t.waitingParts?.note).toBe('Top roller cot from store');
    run(s, DEMO_START + 30 * MIN, { type: 'ticket/repairDone', ticketId: t.id, by: 'suresh' });
    expect(t.waitingParts).toBeUndefined();
  });
});

describe('rules document reader', () => {
  const doc = `Mill QC alert rules, revision 3
1. When a lab test fails, alert the shift supervisor of that frame at once.
2. If nobody answers within 4 minutes, alert the backup supervisor on the same shift.
3. If nobody answers within 8 minutes, alert the QC manager.
4. If nobody answers within 15 minutes, call the plant head.
5. 30s count must stay between 29.5 and 30.5 Ne. Critical.
6. 30s CSP minimum 2250. Major.
7. Every fix needs a lab re-test before the alert is closed.
8. Canteen closes at 22:00 on Sundays.`;
  it('finds the alert chain and limits, knows what is built in, and keeps the rest as notes', () => {
    const s = seedState();
    const found = readRules(doc, s);
    expect(found.filter((f) => f.kind === 'routing').map((f) => f.routing)).toEqual([{ backupMins: 4 }, { qcMins: 8 }, { plantMins: 15 }]);
    const limits = found.filter((f) => f.kind === 'limit');
    expect(limits[0].limit).toMatchObject({ ruleId: 'p30-count', min: 29.5, max: 30.5, severity: 'critical' });
    expect(limits[1].limit).toMatchObject({ ruleId: 'p30-csp', min: 2250, severity: 'major' });
    expect(found.filter((f) => f.kind === 'builtin')).toHaveLength(2);
    expect(found.find((f) => f.text.startsWith('Canteen'))?.kind).toBe('note');
    expect(mergedRouting(currentRouting(s), found)).toEqual({ backupMins: 4, qcMins: 8, plantMins: 15 });
  });
  it('writes the current rules out as sentences', () => {
    const s = seedState();
    const text = rulesAsText(s).join('\n');
    expect(text).toContain('within 5 minutes');
    expect(text).toContain('30s combed, Buyer B: count must be between 29.4 and 30.6 Ne');
  });
});
