import { describe, expect, it } from 'vitest';
import { liveDriver, type LiveMsg, type Transport } from '../src/store/live';
import type { SyncDriver } from '../src/store/sync';
import type { MillEvent } from '../src/engine/types';

// A device's own storage, without localStorage.
function memDriver(start: MillEvent[] = []): SyncDriver {
  let events = start;
  return { load: () => events, append: (e) => void (events = [...events, e]), replace: (x) => void (events = x), subscribe: () => () => {} };
}

// Every device on one room; messages go to everyone else, in order.
function room() {
  const nodes: { onMsg: ((m: LiveMsg) => void)[]; onOpen: (() => void)[] }[] = [];
  const pending: (() => void)[] = [];
  const join = (): Transport => {
    const me = { onMsg: [] as ((m: LiveMsg) => void)[], onOpen: [] as (() => void)[] };
    nodes.push(me);
    return {
      send: (m) => nodes.filter((n) => n !== me).forEach((n) => pending.push(() => n.onMsg.forEach((f) => f(structuredClone(m))))),
      onMessage: (fn) => void me.onMsg.push(fn),
      onOpen: (fn) => void me.onOpen.push(fn),
    };
  };
  const open = (i: number) => nodes[i].onOpen.forEach((f) => f());
  const flush = () => {
    for (let k = 0; k < 100 && pending.length; k++) pending.splice(0).forEach((f) => f());
  };
  return { join, open, flush };
}
const now = (fn: () => void) => fn();
const ev = (id: string, at: number): MillEvent => ({ id, at, by: 'x', type: 'clock/set', simAt: at, realAt: 0, speed: 1 }) as MillEvent;

describe('live sync between devices', () => {
  it('a phone that joins late gets the laptop log, and new events reach everyone', () => {
    const r = room();
    const laptop = liveDriver(memDriver([ev('a0', 0), ev('a1', 1)]), r.join(), now);
    r.open(0);
    const phone = liveDriver(memDriver([ev('p0', 0)]), r.join(), now);
    r.open(1);
    r.flush();
    expect(phone.load().map((e) => e.id)).toEqual(['a0', 'a1']);
    phone.append(ev('p1', 5));
    r.flush();
    expect(laptop.load().map((e) => e.id)).toEqual(['a0', 'a1', 'p1']);
  });

  it('two fresh devices agree on one session', () => {
    const r = room();
    const a = liveDriver(memDriver([ev('m', 0)]), r.join(), now);
    const b = liveDriver(memDriver([ev('k', 0)]), r.join(), now);
    r.open(0);
    r.open(1);
    r.flush();
    expect(a.load()[0].id).toBe('k');
    expect(b.load()[0].id).toBe('k');
  });

  it('events from two devices at once both land, in time order', () => {
    const r = room();
    const a = liveDriver(memDriver([ev('s', 0)]), r.join(), now);
    const b = liveDriver(memDriver([ev('s', 0)]), r.join(), now);
    a.append(ev('x', 20));
    b.append(ev('y', 10));
    r.flush();
    expect(a.load().map((e) => e.id)).toEqual(['s', 'y', 'x']);
    expect(b.load().map((e) => e.id)).toEqual(['s', 'y', 'x']);
  });

  it('reset from the laptop clears every device', () => {
    const r = room();
    const a = liveDriver(memDriver([ev('s', 0), ev('x', 3)]), r.join(), now);
    const b = liveDriver(memDriver([ev('s', 0), ev('x', 3)]), r.join(), now);
    a.replace([ev('n', 0)], true);
    r.flush();
    expect(b.load().map((e) => e.id)).toEqual(['n']);
  });
});
