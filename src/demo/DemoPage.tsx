import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMillState, useNow } from '../store/store';
import { fitterJobs, pendingRequests, takeoversFor } from '../engine/selectors';
import { cx } from '../ui/primitives';
import { ROLE_WORD } from '../app/Person';

const PEOPLE = ['krish', 'rohan', 'suresh', 'priya', 'mohit'];

/** One screen for the jury: dashboard on the left, a phone on the right. */
export function DemoPage() {
  const s = useMillState();
  const now = useNow();
  const [as, setAs] = useState('rohan');
  const needs = (id: string) => {
    const u = s.users.find((x) => x.id === id)!;
    if (u.role === 'tester') return pendingRequests(s).length;
    if (u.role === 'fitter') return fitterJobs(s, id).length;
    return takeoversFor(s, u, now).length;
  };
  return (
    <div className="flex h-dvh bg-sunken">
      <iframe title="Dashboard" src="/dashboard" className="h-full min-w-0 flex-1 border-0 bg-surface" />
      <div className="flex w-[420px] shrink-0 flex-col items-center gap-3 border-l border-line px-4 py-4">
        <div role="tablist" aria-label="Phone belongs to" className="flex w-full gap-1 rounded-[4px] bg-surface p-1">
          {PEOPLE.map((id) => {
            const u = s.users.find((x) => x.id === id)!;
            const n = needs(id);
            return (
              <button
                key={id}
                role="tab"
                aria-selected={as === id}
                onClick={() => setAs(id)}
                className={cx('relative flex-1 rounded-[2px] px-1 py-1.5 text-center', as === id ? 'bg-raised shadow-raised' : 'hover:bg-raised')}
              >
                <span className="t-small-strong block">{u.name.split(' ')[0]}</span>
                <span className="block text-[11px] leading-4 text-muted">{ROLE_WORD[u.role].replace('Shift ', '')}</span>
                {n > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-critical" aria-label={`${n} waiting`} />}
              </button>
            );
          })}
        </div>
        <div className="relative min-h-0 w-[390px] flex-1 overflow-hidden rounded-[40px] border-[10px] border-[#161616] bg-surface shadow-sheet">
          <iframe key={as} title={`Phone: ${as}`} src={`/app?as=${as}&ready=1`} className="size-full border-0" />
        </div>
        <p className="t-small text-muted">
          Same data, live. Open <Link to="/app" className="text-brand underline">/app</Link> on a phone to follow along.
        </p>
      </div>
    </div>
  );
}
