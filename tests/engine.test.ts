import { describe, expect, it } from 'vitest';
import { apply, holdKg, roundKg } from '../src/engine/reducer';
import { DEMO_START, seedState } from '../src/engine/seed';
import { decisionNotices, escalation, frameView, heldKg, holdNudge, myTickets, openHolds, pendingRequests, takeoversFor } from '../src/engine/selectors';
import { MIN } from '../src/engine/time';
import { alertHeat } from '../src/engine/analytics';
import { predictAll, predictFrame } from '../src/engine/predict';
import { plantCases, plantLog, holdOutcomes } from '../src/engine/plant';
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
    expect(openHolds(s)).toHaveLength(2);
    expect(Math.round(heldKg(s, DEMO_START))).toBeGreaterThan(100);
    expect(frameView(s, 'RF-12', DEMO_START).kind).toBe('running');
    expect(frameView(s, 'RF-04', DEMO_START).kind).toBe('stopped');
  });
  it('RF-12 failed count 5 times in October', () => {
    const s = seedState();
    expect(s.tickets.filter((t) => t.frameId === 'RF-12' && t.test === 'count').length).toBe(5);
  });
});

describe('simplified workflow', () => {
  it('fail -> alert -> Seen -> sisters -> Held -> stop -> fixed -> re-test -> decide -> close', () => {
    const s = seedState();
    const t0 = DEMO_START + 15 * MIN; // 09:55
    const lastPass = DEMO_START - 100 * MIN; // 08:00
    // 1-3. Lab tester marks the fail with when the frame last passed.
    run(s, t0, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, lastPassAt: lastPass, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    expect(t.severity).toBe('critical');
    expect(t.sisterFrames).toEqual([]); // no automatic sister frames
    const hold = s.holds.find((h) => h.id === t.holdId)!;
    expect(hold.from).toBe(lastPass);
    expect(roundKg(holdKg(hold, t0))).toBe(60); // 08:00 -> 09:55 at 30 kg/h
    // 4. Only the frame's own supervisor at first; the backup after 5 min; QC at 10; plant head at 20.
    expect(takeoversFor(s, user(s, 'krish'), t0).map((x) => x.id)).toContain(t.id);
    expect(takeoversFor(s, user(s, 'farhan'), t0)).toHaveLength(0);
    expect(takeoversFor(s, user(s, 'farhan'), t0 + 6 * MIN).map((x) => x.id)).toContain(t.id);
    expect(takeoversFor(s, user(s, 'priya'), t0 + 11 * MIN)).toHaveLength(1);
    expect(escalation(t, t0 + 21 * MIN).level).toBe(2);
    // A second fail on the same frame is grouped.
    run(s, t0 + 2 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.8, by: 'rohan' });
    expect(s.tickets.filter((x) => x.frameId === 'RF-12' && x.status !== 'closed')).toHaveLength(1);
    // 5. Seen, tick sister frames, tag the yarn.
    const seen = t0 + 3 * MIN;
    run(s, seen, { type: 'ticket/seen', ticketId: t.id, by: 'krish' });
    run(s, seen, { type: 'ticket/sisters', ticketId: t.id, frameIds: ['RF-13', 'RF-14'], by: 'krish' });
    expect(t.sisterFrames).toEqual(['RF-13', 'RF-14']);
    expect(pendingRequests(s).filter((r) => r.reason === 'sister')).toHaveLength(2);
    run(s, seen + MIN, { type: 'hold/tag', holdId: hold.id, by: 'krish' });
    expect(hold.taggedAt).toBe(seen + MIN);
    // 6. Stop the line: the hold stops growing.
    run(s, seen + 2 * MIN, { type: 'ticket/line', ticketId: t.id, action: 'stopped', by: 'krish' });
    expect(hold.to).toBe(seen + 2 * MIN);
    expect(s.frames.find((f) => f.id === 'RF-12')!.stopped).toBe('Stopped for repair');
    run(s, seen + 3 * MIN, { type: 'ticket/assignFitter', ticketId: t.id, fitterId: 'suresh', by: 'krish' });
    run(s, seen + 20 * MIN, { type: 'ticket/repairDone', ticketId: t.id, by: 'suresh' });
    // 7. Fixed does not close: it asks the lab for a re-test.
    run(s, seen + 22 * MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Setting', by: 'krish' });
    expect(t.status).toBe('fixed');
    expect(s.frames.find((f) => f.id === 'RF-12')!.stopped).toBeUndefined();
    const rq = s.requests.find((r) => r.ticketId === t.id && r.reason === 'retest' && r.status === 'pending')!;
    expect(rq).toBeTruthy();
    // 8. Re-test passes: fix confirmed, still open until the yarn is decided.
    run(s, seen + 40 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 30.0, requestId: rq.id, by: 'rohan' });
    expect(t.fixConfirmedAt).toBeDefined();
    expect(hold.retest).toBe('passed');
    expect(t.status).toBe('fixed');
    // 9. QC decides; the supervisor is told; the ticket closes.
    run(s, seen + 45 * MIN, { type: 'hold/decide', holdId: hold.id, outcome: 'release', reason: 'Re-test passed', by: 'priya' });
    expect(hold.status).toBe('released');
    expect(t.status).toBe('closed');
    expect(decisionNotices(s, user(s, 'krish'), seen + 46 * MIN).map((h) => h.id)).toContain(hold.id);
    run(s, seen + 50 * MIN, { type: 'hold/moved', holdId: hold.id, by: 'krish' });
    expect(decisionNotices(s, user(s, 'krish'), seen + 51 * MIN)).toHaveLength(0);
  });

  it('a failed re-test reopens the ticket, alerts again and keeps the hold growing', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'ticket/seen', ticketId: t.id, by: 'krish' });
    run(s, DEMO_START + 30 * MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Machine', by: 'krish' });
    const rq = s.requests.find((r) => r.ticketId === t.id && r.reason === 'retest' && r.status === 'pending')!;
    run(s, DEMO_START + 50 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.7, requestId: rq.id, by: 'rohan' });
    expect(t.status).toBe('open');
    expect(t.reopened).toBe(1);
    expect(t.alertAt).toBe(DEMO_START + 50 * MIN);
    expect(s.holds.find((h) => h.id === t.holdId)!.to).toBeUndefined();
    expect(takeoversFor(s, user(s, 'krish'), DEMO_START + 51 * MIN).map((x) => x.id)).toContain(t.id);
  });

  it('sample error releases the hold and closes as a false alarm', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + 8 * MIN, { type: 'result/sampleError', resultId: t.readings[0].resultId!, by: 'rohan' });
    expect(t.closeReason).toBe('sample_error');
    expect(s.holds.find((h) => h.id === t.holdId)!.status).toBe('released');
    expect(s.requests.filter((r) => r.ticketId === t.id && r.status === 'pending')).toHaveLength(0);
  });

  it('release against a failed or missing re-test needs plant head approval', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Setting', by: 'krish' });
    const h = s.holds.find((x) => x.id === t.holdId)!;
    run(s, DEMO_START + 5 * MIN, { type: 'hold/decide', holdId: h.id, outcome: 'release', reason: 'Delivery due', by: 'priya' });
    expect(h.status).toBe('on_hold');
    run(s, DEMO_START + 9 * MIN, { type: 'hold/approve', holdId: h.id, by: 'mohit' });
    expect(h.status).toBe('released');
    expect(t.status).toBe('fixed'); // still waiting for the re-test to confirm the fix
    const rq = s.requests.find((r) => r.ticketId === t.id && r.reason === 'retest' && r.status === 'pending')!;
    run(s, DEMO_START + 20 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 30.1, requestId: rq.id, by: 'rohan' });
    expect(t.status).toBe('closed');
  });

  it('nudges the QC manager after 2 hours and the plant head at the end of the shift', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const h = s.holds.at(-1)!;
    expect(holdNudge(s, h, DEMO_START + 60 * MIN)).toBe('none');
    expect(holdNudge(s, h, DEMO_START + 125 * MIN)).toBe('qc');
    expect(holdNudge(s, h, DEMO_START + 5 * 60 * MIN)).toBe('plant'); // A shift ends 14:00
  });

  it('the seed history follows the rules: every closed fix was confirmed by a re-test', () => {
    const s = seedState();
    const fixed = s.tickets.filter((t) => t.status === 'closed' && t.closeReason === 'fixed' && t.test);
    expect(fixed.length).toBeGreaterThan(10);
    expect(fixed.every((t) => t.fixConfirmedAt)).toBe(true);
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
  const pending = (s: MillState) => {
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Draft setting slipped', by: 'krish' });
    const h = s.holds.find((x) => x.id === t.holdId)!;
    run(s, DEMO_START + 5 * MIN, { type: 'hold/decide', holdId: h.id, outcome: 'release', reason: 'Buyer B accepts 0.1 Ne', by: 'priya' });
    return { t, h };
  };

  it('starts with the two repeat frames waiting and knows each lot\'s buyer and dispatch', () => {
    const s = seedState();
    const cases = plantCases(s, DEMO_START);
    expect(cases.map((c) => c.id)).toEqual(['RF-12', 'RF-17']);
    const rf12 = cases[0];
    expect(rf12.kind === 'frame' && rf12.afterRoving).toBeGreaterThanOrEqual(3);
    expect(s.lots.find((l) => l.id === '2417')!.dispatchAt).toBeGreaterThan(DEMO_START);
    expect(s.products.find((p) => p.id === 'p30')!.buyer).toBe('Buyer B');
  });

  it('a release against a failed test reaches him first, with the approval reason recorded', () => {
    const s = seedState();
    const { h } = pending(s);
    expect(plantCases(s, DEMO_START + 6 * MIN)[0]).toMatchObject({ kind: 'release', id: h.id, deadline: s.lots.find((l) => l.id === h.lotId)!.dispatchAt });
    run(s, DEMO_START + 9 * MIN, { type: 'hold/approve', holdId: h.id, reason: 'Buyer confirmed by phone', by: 'mohit' });
    expect(h.decisions.at(-1)!.approvedReason).toBe('Buyer confirmed by phone');
    expect(plantLog(s)[0].text).toContain('Released RF-12');
  });

  it('sending a release back returns the lot to the QC manager', () => {
    const s = seedState();
    const { h } = pending(s);
    run(s, DEMO_START + 9 * MIN, { type: 'hold/sendBack', holdId: h.id, reason: 'Re-test first', by: 'mohit' });
    expect(h.status).toBe('on_hold');
    expect(plantCases(s, DEMO_START + 10 * MIN).some((c) => c.id === h.id)).toBe(false);
    run(s, DEMO_START + 11 * MIN, { type: 'hold/approve', holdId: h.id, by: 'mohit' });
    expect(h.status).toBe('on_hold');
    run(s, DEMO_START + 12 * MIN, { type: 'hold/decide', holdId: h.id, outcome: 'reprocess', reason: 'Too far out', by: 'priya' });
    expect(h.status).toBe('reprocess');
  });

  it('a frame decision clears the case until the frame fails again', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'frame/decide', frameId: 'RF-12', outcome: 'procedure', reason: 'Check draft after every roving change', by: 'mohit' });
    expect(plantCases(s, DEMO_START + MIN).map((c) => c.id)).toEqual(['RF-17']);
    run(s, DEMO_START + 2 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    expect(plantCases(s, DEMO_START + 3 * MIN).some((c) => c.id === 'RF-12')).toBe(true);
  });

  it('counts holds that turned out fine', () => {
    const s = seedState();
    const o = holdOutcomes(s, DEMO_START - 30 * 24 * 60 * MIN, DEMO_START);
    expect(o.fine.length).toBeGreaterThan(0);
    expect(o.fine.length).toBeLessThan(o.holds.length);
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
