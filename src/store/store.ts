import { create } from 'zustand';
import { useEffect } from 'react';
import { apply } from '../engine/reducer';
import { DEMO_START, seedState } from '../engine/seed';
import { MIN, nowFrom } from '../engine/time';
import type { MillEvent, MillEventInput, MillState, User } from '../engine/types';
import { localDriver } from './sync';

const driver = localDriver();

function build(events: MillEvent[]): MillState {
  const s = seedState();
  for (const e of events) apply(s, e);
  return s;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

interface Store {
  events: MillEvent[];
  state: MillState;
  now: number;
  dispatch: (e: MillEventInput) => MillEvent;
  setSpeed: (speed: number) => void;
  skip: (mins: number) => void;
  reset: () => void;
}

function startClock(): MillEvent {
  return { id: uid(), at: DEMO_START, by: 'system', type: 'clock/set', simAt: DEMO_START, realAt: Date.now(), speed: 1 };
}

let initial = driver.load();
if (!initial.some((e) => e.type === 'clock/set')) {
  initial = [startClock(), ...initial];
  driver.replace(initial);
}
const initialState = build(initial);

export const useMill = create<Store>((set, get) => ({
  events: initial,
  state: initialState,
  now: nowFrom(initialState.clock),
  dispatch(input) {
    const { state } = get();
    const e = { ...(input as object), id: uid(), at: nowFrom(state.clock) } as MillEvent;
    const next = structuredClone(state);
    apply(next, e);
    driver.append(e);
    set({ events: [...get().events, e], state: next, now: nowFrom(next.clock) });
    return e;
  },
  setSpeed(speed) {
    const now = nowFrom(get().state.clock);
    get().dispatch({ type: 'clock/set', simAt: now, realAt: Date.now(), speed, by: 'system' });
  },
  skip(mins) {
    const { clock } = get().state;
    get().dispatch({ type: 'clock/set', simAt: nowFrom(clock) + mins * MIN, realAt: Date.now(), speed: clock.speed, by: 'system' });
  },
  reset() {
    const events = [startClock()];
    driver.replace(events);
    const state = build(events);
    set({ events, state, now: nowFrom(state.clock) });
  },
}));

// Follow other tabs, iframes and devices.
driver.subscribe((events) => {
  const { events: mine, state } = useMill.getState();
  const sameStart = events[0]?.id === mine[0]?.id;
  if (sameStart && events.length >= mine.length) {
    if (events.length === mine.length) return;
    const next = structuredClone(state);
    for (const e of events.slice(mine.length)) apply(next, e);
    useMill.setState({ events, state: next, now: nowFrom(next.clock) });
  } else {
    const next = build(events);
    useMill.setState({ events, state: next, now: nowFrom(next.clock) });
  }
});

// Mill clock tick.
setInterval(() => {
  useMill.setState({ now: nowFrom(useMill.getState().state.clock) });
}, 250);

export const useNow = () => useMill((s) => s.now);
export const useMillState = () => useMill((s) => s.state);
export const useDispatch = () => useMill((s) => s.dispatch);

// ---------- who is using this surface ----------
type Surface = 'app' | 'dash';
const DEFAULT_USER: Record<Surface, string> = { app: 'krish', dash: 'priya' };

interface Session {
  userId: Record<Surface, string>;
  theme: Record<Surface, 'day' | 'night'>;
  setUser: (s: Surface, id: string) => void;
  setTheme: (s: Surface, t: 'day' | 'night') => void;
}

const stored = (k: string, fallback: string) => {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const useSession = create<Session>((set, get) => ({
  userId: { app: stored('qc.app.user', DEFAULT_USER.app), dash: stored('qc.dash.user', DEFAULT_USER.dash) },
  theme: {
    app: stored('qc.app.theme', 'day') as 'day' | 'night',
    dash: stored('qc.dash.theme', 'day') as 'day' | 'night',
  },
  setUser(s, id) {
    store(`qc.${s}.user`, id);
    set({ userId: { ...get().userId, [s]: id } });
  },
  setTheme(s, t) {
    store(`qc.${s}.theme`, t);
    set({ theme: { ...get().theme, [s]: t } });
  },
}));

export function useUser(surface: Surface): User {
  const id = useSession((s) => s.userId[surface]);
  const users = useMill((s) => s.state.users);
  return users.find((u) => u.id === id) ?? users.find((u) => u.id === DEFAULT_USER[surface])!;
}

export function useTheme(surface: Surface) {
  const theme = useSession((s) => s.theme[surface]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#161616' : '#f4f4f4');
  }, [theme]);
  return theme;
}
