import { describe, expect, it } from 'vitest';
import { apply, holdKg, roundKg } from '../src/engine/reducer';
import { DEMO_START, seedState } from '../src/engine/seed';
import { escalation, frameView, heldKg, myTickets, openHolds, pendingRequests, takeoversFor, timeline } from '../src/engine/selectors';
import { MIN } from '../src/engine/time';
import { alertHeat } from '../src/engine/analytics';
import { predictAll, predictFrame } from '../src/engine/predict';
import type { MillEvent, MillEventInput, MillState } from '../src/engine/types';

let n = 0;
const run = (s: MillState, at: number, e: MillEventInput) => apply(s, { ...(e as object), id: `t${++n}`, at } as MillEvent);
const user = (s: MillState, id: string) => s.users.find((u) => u.id === id)!;

describe('seed', () => {
  it('has a month of history and a calm start', () => {
    const s = seedState();
    expect(s.tickets.length).toBeGreaterThanOrEqual(30);
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

describe('jury demo path', () => {
  it('drift -> urgent test -> critical fail -> contain -> escalate -> fix -> retest -> release -> close', () => {
    const s = seedState();
    const t0 = DEMO_START + 5 * MIN; // 09:45
    run(s, t0, { type: 'sim/drift', frameId: 'RF-12', cvPct: 2.4, by: 'system' });
    const drift = s.tickets.at(-1)!;
    expect(drift.severity).toBe('major');
    expect(drift.kind).toBe('drift');
    const req = s.requests.find((r) => r.ticketId === drift.id)!;
    expect(req.urgent).toBe(true);
    expect(takeoversFor(s, user(s, 'krish'), t0).map((t) => t.id)).toContain(drift.id);

    // Lab enters 28.9 at 09:55 -> critical, same ticket raised.
    const t1 = DEMO_START + 15 * MIN;
    run(s, t1, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, requestId: req.id, by: 'rohan' });
    const t = s.tickets.find((x) => x.id === drift.id)!;
    expect(t.severity).toBe('critical');
    expect(t.status).toBe('open');
    expect(t.sisterFrames).toEqual(['RF-13', 'RF-14']);
    const hold = s.holds.find((h) => h.id === t.holdId)!;
    expect(roundKg(holdKg(hold, t1))).toBe(60); // 08:00 -> 09:55 at 30 kg/h
    expect(s.requests.filter((r) => r.reason === 'sister' && r.status === 'pending')).toHaveLength(2);
    expect(frameView(s, 'RF-12', t1).kind).toBe('fault');
    expect(frameView(s, 'RF-13', t1).kind).toBe('warning');

    // Nobody taps: QC manager at 10 min, plant head at 20.
    expect(escalation(t, t1 + 11 * MIN).level).toBe(1);
    expect(takeoversFor(s, user(s, 'priya'), t1 + 11 * MIN)).toHaveLength(1);
    expect(takeoversFor(s, user(s, 'mohit'), t1 + 11 * MIN)).toHaveLength(0);
    expect(escalation(t, t1 + 21 * MIN).level).toBe(2);

    // A second fail on the same frame is grouped.
    run(s, t1 + 3 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.8, by: 'rohan' });
    expect(s.tickets.filter((x) => x.frameId === 'RF-12' && x.status !== 'closed')).toHaveLength(1);

    const seenAt = t1 + 21 * MIN;
    run(s, seenAt, { type: 'ticket/seen', ticketId: t.id, by: 'krish' });
    expect(escalation(t, seenAt + 60 * MIN).level).toBe(2); // frozen at Seen
    expect(timeline(t, seenAt).filter((e) => e.kind === 'escalated')).toHaveLength(2);

    run(s, seenAt + MIN, { type: 'ticket/working', ticketId: t.id, by: 'krish' });
    run(s, seenAt + 2 * MIN, { type: 'ticket/assignFitter', ticketId: t.id, fitterId: 'suresh', by: 'krish' });
    run(s, seenAt + 20 * MIN, { type: 'ticket/repairDone', ticketId: t.id, by: 'suresh' });
    run(s, seenAt + 22 * MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Draft setting slipped', by: 'krish' });
    expect(t.status).toBe('fixed');
    expect(hold.to).toBe(seenAt + 22 * MIN);

    // Releasing without a passed re-test needs the plant head.
    run(s, seenAt + 30 * MIN, { type: 'hold/retest', holdId: hold.id, by: 'priya' });
    const rq = s.requests.find((r) => r.holdId === hold.id && r.status === 'pending')!;
    run(s, seenAt + 50 * MIN, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 30.0, requestId: rq.id, by: 'rohan' });
    expect(hold.retest).toBe('passed');
    run(s, seenAt + 55 * MIN, { type: 'hold/decide', holdId: hold.id, outcome: 'release', reason: 'Re-test passed', by: 'priya' });
    expect(hold.status).toBe('released');
    expect(t.status).toBe('closed');
  });

  it('drift that passes the lab test closes as checked OK', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'sim/drift', frameId: 'RF-07', cvPct: 2.3, by: 'system' });
    const t = s.tickets.at(-1)!;
    const req = s.requests.find((r) => r.ticketId === t.id)!;
    run(s, DEMO_START + 10 * MIN, { type: 'result/enter', frameId: 'RF-07', test: 'count', value: 40.1, requestId: req.id, by: 'rohan' });
    expect(t.status).toBe('closed');
    expect(t.closeReason).toBe('checked_ok');
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

  it('release against a failed re-test needs plant head approval', () => {
    const s = seedState();
    run(s, DEMO_START, { type: 'result/enter', frameId: 'RF-12', test: 'count', value: 28.9, by: 'rohan' });
    const t = s.tickets.at(-1)!;
    run(s, DEMO_START + MIN, { type: 'ticket/fixed', ticketId: t.id, cause: 'Draft setting slipped', by: 'krish' });
    const h = s.holds.find((x) => x.id === t.holdId)!;
    run(s, DEMO_START + 5 * MIN, { type: 'hold/decide', holdId: h.id, outcome: 'release', reason: 'Delivery due', by: 'priya' });
    expect(h.status).toBe('on_hold');
    run(s, DEMO_START + 9 * MIN, { type: 'hold/approve', holdId: h.id, by: 'mohit' });
    expect(h.status).toBe('released');
    expect(t.status).toBe('closed');
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
    run(s, DEMO_START + MIN, { type: 'sim/drift', frameId: 'RF-20', cvPct: 2.4, by: 'system' });
    const q = pendingRequests(s);
    expect(q[0].reason).toBe('sister');
    expect(s.tickets.find((x) => x.id === q[0].ticketId)!.severity).toBe('critical');
  });
});
