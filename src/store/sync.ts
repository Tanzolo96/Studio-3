import type { MillEvent } from '../engine/types';

/** Where the event log lives. Local = this browser (tabs and iframes stay in sync).
 *  A Supabase driver with the same shape replaces this for cross-device demos. */
export interface SyncDriver {
  load(): MillEvent[];
  append(e: MillEvent): void;
  replace(events: MillEvent[]): void;
  subscribe(onChange: (events: MillEvent[]) => void): () => void;
}

const KEY = 'qc-alert.log.v1';

function read(): MillEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}
function write(events: MillEvent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    /* storage full or blocked: the session still works in memory */
  }
}

export function localDriver(): SyncDriver {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('qc-alert') : undefined;
  let memory = read();
  return {
    load: () => memory,
    append(e) {
      memory = [...read(), e];
      write(memory);
      channel?.postMessage('changed');
    },
    replace(events) {
      memory = events;
      write(memory);
      channel?.postMessage('changed');
    },
    subscribe(onChange) {
      const handler = () => {
        memory = read();
        onChange(memory);
      };
      channel?.addEventListener('message', handler);
      const onStorage = (ev: StorageEvent) => ev.key === KEY && handler();
      window.addEventListener('storage', onStorage);
      return () => {
        channel?.removeEventListener('message', handler);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}
