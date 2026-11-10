import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Asleep, Light } from '@carbon/icons-react';
import { useMillState, useNow, useSession, useTheme, useUser } from '../store/store';
import { heldKg, isEscalated } from '../engine/selectors';
import { roundKg } from '../engine/reducer';
import { cx } from '../ui/primitives';
import { ROLE_WORD } from '../app/Person';
import { SimulatorDock } from '../demo/Simulator';

const NAV: { group: string; items: { to: string; label: string; end?: boolean }[] }[] = [
  {
    group: 'Operations',
    items: [
      { to: '/dashboard', label: 'Overview', end: true },
      { to: '/dashboard/tickets', label: 'Tickets' },
      { to: '/dashboard/held', label: 'Held yarn' },
      { to: '/dashboard/machines', label: 'Machines' },
    ],
  },
  {
    group: 'Insight',
    items: [
      { to: '/dashboard/insights', label: 'AI insights' },
      { to: '/dashboard/report', label: 'Monthly report' },
      { to: '/dashboard/rules', label: 'Rules' },
      { to: '/dashboard/account', label: 'Account' },
    ],
  },
];

export function DashShell() {
  const surfaceTheme = useTheme('dash');
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const { theme, setTheme, setUser } = useSession();
  const [picker, setPicker] = useState(false);
  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed');
  const urgent = live.some((t) => t.severity === 'critical' || isEscalated(t, now));
  const kg = roundKg(heldKg(s, now));

  return (
    <div data-theme={surfaceTheme} className="flex min-h-dvh gap-3 bg-sunken p-3 text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-toast)] focus:rounded-[10px] focus:bg-raised focus:p-3">
        Skip to content
      </a>
      <aside className="w-[220px] shrink-0">
        <div className="sticky top-3 z-[var(--z-dock)] flex h-[calc(100dvh-24px)] flex-col">
        <div className="flex h-[60px] items-center gap-2 px-4">
          <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="12" fill="var(--ink)" />
            <path d="M32 13 54 51H10Z" fill="var(--critical)" />
          </svg>
          <span className="t-section">QC Alert</span>
        </div>
        <nav aria-label="Dashboard" className="flex flex-col gap-5 pt-2">
          {NAV.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <p className="t-label px-5 pb-1 text-[11px] text-neutral">{g.group}</p>
              {g.items.map((n) => (
            <NavItem key={n.to} {...n}>
              {n.label === 'Tickets' && live.length > 0 && (
                <span className={cx('t-data grid h-6 min-w-6 place-items-center rounded-[6px] px-1.5 text-[13px]', urgent ? 'bg-critical-soft text-critical' : 'bg-minor-soft text-minor')}>
                  {live.length}
                </span>
              )}
              {n.label === 'Held yarn' && kg > 0 && <span className="t-data rounded-[6px] bg-held-soft px-1.5 text-[13px] text-held">{kg} kg</span>}
            </NavItem>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto p-1">
          <SimulatorDock />
          <div className="mb-2 grid grid-cols-2 gap-1" role="radiogroup" aria-label="Theme">
            {(['day', 'night'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme.dash === t}
                onClick={() => setTheme('dash', t)}
                className={cx('t-small flex h-9 items-center justify-center gap-1.5 rounded-[10px]', theme.dash === t ? 'bg-raised font-semibold text-ink shadow-raised' : 'text-muted hover:text-ink')}
              >
                {t === 'day' ? <Light size={16} /> : <Asleep size={16} />}
                {t === 'day' ? 'Day' : 'Night'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPicker((p) => !p)} aria-expanded={picker} className="w-full rounded-[10px] px-2 py-2 text-left hover:bg-raised">
            <span className="t-body-strong block">{user.name}</span>
            <span className="t-small text-muted">{ROLE_WORD[user.role]} · switch</span>
          </button>
          {picker && (
            <ul className="anim-fade mt-1 flex flex-col rounded-[10px] border border-line bg-raised py-1 shadow-sheet">
              {['priya', 'mohit', 'krish'].map((id) => {
                const u = s.users.find((x) => x.id === id)!;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        setUser('dash', id);
                        setPicker(false);
                      }}
                      className={cx('t-small flex w-full justify-between px-3 py-2 text-left hover:bg-sunken', u.id === user.id && 'font-semibold')}
                    >
                      {u.name}
                      <span className="text-muted">{ROLE_WORD[u.role]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 rounded-[28px] bg-raised px-8 pt-8 pb-24 shadow-raised">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, end, children }: { to: string; label: string; end?: boolean; children?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx('mx-3 flex h-10 items-center justify-between rounded-[12px] px-3 t-body', isActive ? 'bg-brand font-semibold text-on-brand' : 'text-muted hover:bg-[var(--surface-raised)] hover:text-ink')
      }
    >
      {label}
      {children}
    </NavLink>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="t-page">{title}</h1>
        {sub && <p className="t-small mt-1 text-muted">{sub}</p>}
      </div>
      {actions}
    </header>
  );
}
