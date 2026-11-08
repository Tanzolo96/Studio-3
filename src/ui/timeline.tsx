import type { MillState, Ticket, TicketEvent } from '../engine/types';
import { timeline } from '../engine/selectors';
import { userName } from '../engine/reducer';
import { dayMonth, hhmm, sameMillDay } from '../engine/time';
import { cx } from './primitives';

const MARK: Partial<Record<TicketEvent['kind'], string>> = {
  created: 'var(--ink)',
  upgraded: 'var(--critical)',
  escalated: 'var(--critical)',
  contained: 'var(--held)',
  seen: 'var(--brand)',
  working: 'var(--major-fill)',
  fitter_assigned: 'var(--major-fill)',
  repair_done: 'var(--major-fill)',
  fixed: 'var(--ok)',
  closed: 'var(--ok)',
  sample_error: 'var(--neutral-state)',
};

export function Timeline({ s, t, now, dense }: { s: MillState; t: Ticket; now: number; dense?: boolean }) {
  const items = timeline(t, now);
  return (
    <ol className="relative flex flex-col">
      {items.map((e, i) => {
        const by = e.by && e.by !== 'system' ? userName(s, e.by) : 'System';
        const showDay = i === 0 || !sameMillDay(items[i - 1].at, e.at);
        return (
          <li key={i} className={cx('relative grid grid-cols-[44px_16px_1fr] gap-x-2', dense ? 'pb-3' : 'pb-4')}>
            <span className="t-data pt-px text-[13px] text-muted">{hhmm(e.at)}</span>
            <span className="relative flex justify-center">
              <span className="z-[1] mt-[5px] size-2.5 rounded-full border-2 bg-raised" style={{ borderColor: MARK[e.kind] ?? 'var(--line-strong)' }} />
              {i < items.length - 1 && <span className="absolute top-4 bottom-[-4px] w-px bg-line" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className={cx('t-small block', e.kind === 'escalated' ? 'font-semibold text-critical' : 'text-ink')}>{e.text}</span>
              <span className="t-small text-muted">
                {by}
                {showDay && i > 0 ? ` · ${dayMonth(e.at)}` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
