// Live sync across devices for the jury demo: two phones and a laptop share one event log.
// The log still lives on each device (localStorage) and a broadcast channel carries changes:
//   e      one new event
//   hello  "I joined, this is the log I have" (first id + length)
//   log    a whole log, sent to a device that is behind
//   reset  start again: everyone takes this log
// No server code and no database tables: Supabase Realtime broadcast only relays messages.
// Any device that holds the log (usually the laptop) brings a newcomer up to date.
import { create } from 'zustand';
import type { MillEvent } from '../engine/types';
import type { SyncDriver } from './sync';

export type LiveMsg =
  | { k: 'e'; first: string; e: MillEvent }
  | { k: 'hello'; first?: string; n: number }
  | { k: 'log'; events: MillEvent[] }
  | { k: 'reset'; events: MillEvent[] };

/** How messages travel. Supabase in the app; an in-memory bus in tests. */
export interface Transport {
  send(m: LiveMsg): void;
  onMessage(fn: (m: LiveMsg) => void): void;
  /** Called once connected; a reconnect calls it again. */
  onOpen(fn: () => void): void;
}

export interface Peer {
  id: string;
  who: string;
}
export interface LiveStatus {
  room: string | null;
  state: 'local' | 'connecting' | 'live' | 'offline';
  peers: Peer[];
}
export const useLive = create<LiveStatus>(() => ({ room: null, state: 'local', peers: [] }));

/** Keep the session's first event first; everything else in time order (ties keep arrival order). */
function ordered(events: MillEvent[]): MillEvent[] {
  if (events.length < 2) return events;
  const [head, ...rest] = events;
  return [head, ...rest.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i).map((x) => x.e)];
}

/** Add the events we do not have yet. Same session only (same first event). */
export function union(mine: MillEvent[], theirs: MillEvent[]): MillEvent[] {
  const ids = new Set(mine.map((e) => e.id));
  const add = theirs.filter((e) => !ids.has(e.id));
  return add.length ? ordered([...mine, ...add]) : mine;
}

/** Two different sessions: the longer log wins; on a tie, the one that started with the smaller id. */
export function pick(mine: MillEvent[], theirs: MillEvent[]): MillEvent[] {
  if (!theirs.length) return mine;
  if (!mine.length) return theirs;
  if (mine[0].id === theirs[0].id) return union(mine, theirs);
  if (theirs.length !== mine.length) return theirs.length > mine.length ? theirs : mine;
  return theirs[0].id < mine[0].id ? theirs : mine;
}

export function liveDriver(local: SyncDriver, transport: Transport, delay: (fn: () => void) => void = (fn) => setTimeout(fn, 60 + Math.random() * 300)): SyncDriver {
  let memory = local.load();
  const listeners = new Set<(events: MillEvent[]) => void>();
  const set = (next: MillEvent[]) => {
    if (next === memory) return;
    memory = next;
    local.replace(memory);
    for (const l of listeners) l(memory);
  };
  const hello = () => transport.send({ k: 'hello', first: memory[0]?.id, n: memory.length });

  transport.onOpen(hello);
  transport.onMessage((m) => {
    if (m.k === 'e') {
      if (memory[0]?.id === m.first) set(union(memory, [m.e]));
      else hello(); // a different session: compare logs
    } else if (m.k === 'hello') {
      // Bring a device up to date if we know more than it does, or it is on another session.
      if (memory.length && (m.first !== memory[0].id || memory.length > m.n)) delay(() => transport.send({ k: 'log', events: memory }));
    } else if (m.k === 'log') {
      const next = pick(memory, m.events);
      set(next);
      // They are behind us after all: tell them.
      if (next === memory && m.events[0]?.id === memory[0]?.id && memory.length > m.events.length) delay(() => transport.send({ k: 'log', events: memory }));
    } else if (m.k === 'reset') {
      set(m.events);
    }
  });
  // Other tabs on this device still follow through the local driver.
  local.subscribe((events) => {
    memory = events;
    for (const l of listeners) l(memory);
  });

  return {
    load: () => memory,
    append(e) {
      memory = [...memory, e];
      local.append(e);
      transport.send({ k: 'e', first: memory[0].id, e });
    },
    replace(events, announce) {
      memory = events;
      local.replace(events);
      if (announce) transport.send({ k: 'reset', events });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ---------- Supabase transport ----------
export const SUPABASE_URL = 'https://maxdjnkgctrfvdnmqepi.supabase.co';
/** The project's publishable key. Safe in a web page: it only allows what the project allows anonymous users to do.
 *  The demo uses Realtime broadcast only, so no tables are exposed. */
export const SUPABASE_KEY = 'sb_publishable_hXrsBcIoHJbftaSPFO_Yuw_U9C1jJOj';

export const liveReady = () => !!SUPABASE_KEY;

/** Room for this device, set by a jury link (?room=...). No room: local only. */
export function currentRoom(): string | null {
  try {
    const r = localStorage.getItem('qc.room');
    return r && /^[a-z0-9-]{3,24}$/.test(r) ? r : null;
  } catch {
    return null;
  }
}

/** Who this device is, for the connected-devices list on the Jury page. */
function whoAmI(): string {
  try {
    const onApp = location.hash.startsWith('#app') || location.pathname.startsWith('/app');
    const id = localStorage.getItem(onApp ? 'qc.app.user' : 'qc.dash.user') ?? (onApp ? 'krish' : 'priya');
    return `${id}|${onApp ? 'phone' : 'dashboard'}`;
  } catch {
    return 'unknown|device';
  }
}

export function supabaseTransport(room: string): Transport {
  const msgFns: ((m: LiveMsg) => void)[] = [];
  const openFns: (() => void)[] = [];
  const queue: LiveMsg[] = [];
  let send: ((m: LiveMsg) => void) | null = null;
  const me = Math.random().toString(36).slice(2, 10);
  useLive.setState({ room, state: 'connecting' });

  void import('@supabase/supabase-js').then(({ createClient }) => {
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const ch = client.channel(`qc-alert-${room}`, { config: { broadcast: { self: false }, presence: { key: me } } });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => msgFns.forEach((f) => f(payload as LiveMsg)));
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState<{ who: string }>();
      const peers = Object.entries(st).map(([id, metas]) => ({ id, who: metas[0]?.who ?? '' }));
      useLive.setState({ peers });
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        send = (m) => void ch.send({ type: 'broadcast', event: 'm', payload: m });
        useLive.setState({ state: 'live' });
        void ch.track({ who: whoAmI() });
        while (queue.length) send(queue.shift()!);
        openFns.forEach((f) => f());
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        send = null;
        useLive.setState({ state: 'offline' });
      }
    });
    // Phones sleep and wake: say hello again when the page comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && send) openFns.forEach((f) => f());
    });
  });

  return {
    send(m) {
      if (send) send(m);
      else if (m.k !== 'hello') queue.push(m);
    },
    onMessage: (fn) => void msgFns.push(fn),
    onOpen: (fn) => void openFns.push(fn),
  };
}
