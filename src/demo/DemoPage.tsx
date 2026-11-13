import { useMemo, useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useMillState, useNow } from '../store/store';
import { fitterJobs, pendingRequests, takeoversFor } from '../engine/selectors';
import { cx } from '../ui/primitives';
import { ROLE_WORD } from '../app/Person';
import { appRoutes, dashRoutes } from '../routes';
import { InDemo } from '../dashboard/DashShell';

const PEOPLE = ['ramesh', 'krish', 'rohan', 'suresh', 'priya', 'mohit'];

/** One screen for the jury: dashboard on the left, a phone on the right, same live data. */
export function DemoPage() {
  const s = useMillState();
  const now = useNow();
  const [as, setAs] = useState('rohan');
  const dash = useMemo(() => createMemoryRouter([dashRoutes], { initialEntries: ['/dashboard'] }), []);
  const phone = useMemo(() => createMemoryRouter([appRoutes], { initialEntries: [`/app?as=${as}&ready=1`] }), [as]);
  const needs = (id: string) => {
    const u = s.users.find((x) => x.id === id)!;
    if (u.role === 'tester') return pendingRequests(s).length;
    if (u.role === 'fitter') return fitterJobs(s, id).length;
    return takeoversFor(s, u, now).length;
  };
  return (
    <div className="flex h-dvh bg-sunken text-ink">
      <div className="h-full min-w-0 flex-1 overflow-auto">
        <InDemo.Provider value>
          <RouterProvider router={dash} />
        </InDemo.Provider>
      </div>
      <div className="flex h-full w-[430px] shrink-0 flex-col border-l border-line">
        <div role="tablist" aria-label="Phone belongs to" className="mx-3 mt-3 flex gap-1 rounded-[10px] bg-surface p-1">
          {PEOPLE.map((id) => {
            const u = s.users.find((x) => x.id === id)!;
            const n = needs(id);
            return (
              <button
                key={id}
                role="tab"
                aria-selected={as === id}
                onClick={() => setAs(id)}
                className={cx('relative flex-1 rounded-[6px] px-1 py-1.5 text-center', as === id ? 'bg-raised shadow-raised' : 'hover:bg-raised')}
              >
                <span className="t-small-strong block">{u.name.split(' ')[0]}</span>
                <span className="block text-[11px] leading-4 text-muted">{ROLE_WORD[u.role].replace('Shift ', '')}</span>
                {n > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-critical" aria-label={`${n} waiting`} />}
              </button>
            );
          })}
        </div>
        <div className="demo-phone min-h-0 flex-1 overflow-hidden [&>div]:min-h-full [&>div]:bg-sunken">
          <RouterProvider key={as} router={phone} />
        </div>
      </div>
    </div>
  );
}
