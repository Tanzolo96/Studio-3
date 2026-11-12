import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Asleep, Chip, Dashboard, Idea, Light, Locked, Notification, Report, Rule, Search, Task, UserAvatar } from '@carbon/icons-react';
import { useMillState, useNow, useSession, useTheme, useUser } from '../store/store';
import { heldKg, isEscalated } from '../engine/selectors';
import { roundKg } from '../engine/reducer';
import { cx } from '../ui/primitives';
import { ROLE_WORD } from '../app/Person';
import { SimulatorDock } from '../demo/Simulator';

const ICON: Record<string, ReactNode> = {
  Overview: <Dashboard size={18} />,
  'My shift': <Dashboard size={18} />,
  Tickets: <Task size={18} />,
  'Held yarn': <Locked size={18} />,
  Machines: <Chip size={18} />,
  'AI insights': <Idea size={18} />,
  'Monthly report': <Report size={18} />,
  Rules: <Rule size={18} />,
  Account: <UserAvatar size={18} />,
};

type Role = 'supervisor' | 'qc' | 'plant';
/** roles: who sees the item in the sidebar. Left out = everyone. */
const NAV: { group: string; items: { to: string; label: string; end?: boolean; roles?: Role[] }[] }[] = [
  {
    group: 'Operations',
    items: [
      { to: '/dashboard', label: 'Overview', end: true },
      { to: '/dashboard/tickets', label: 'Tickets' },
      { to: '/dashboard/held', label: 'Held yarn' },
      { to: '/dashboard/machines', label: 'Machines', roles: ['supervisor', 'qc'] },
    ],
  },
  {
    group: 'Insight',
    items: [
      { to: '/dashboard/insights', label: 'AI insights', roles: ['qc', 'plant'] },
      { to: '/dashboard/report', label: 'Monthly report', roles: ['qc', 'plant'] },
      { to: '/dashboard/rules', label: 'Rules', roles: ['qc'] },
      { to: '/dashboard/account', label: 'Account' },
    ],
  },
];

/** True when the dashboard is shown inside the jury demo page. */
export const InDemo = createContext(false);

export function DashShell() {
  const inDemo = useContext(InDemo);
  const surfaceTheme = useTheme('dash');
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const { theme, setTheme, setUser } = useSession();
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const away = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPicker(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [picker]);
  const live = s.tickets.filter((t) => t.status !== 'closed' && t.status !== 'fixed');
  const urgent = live.some((t) => t.severity === 'critical' || isEscalated(t, now));
  const kg = roundKg(heldKg(s, now));

  return (
    <div data-theme={surfaceTheme} className="flex min-h-dvh gap-3 bg-surface p-3 text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-toast)] focus:rounded-[10px] focus:bg-raised focus:p-3">
        Skip to content
      </a>
      <aside className="w-[220px] shrink-0">
        <div className="sticky top-3 z-[var(--z-dock)] flex h-[calc(100dvh-24px)] flex-col">
        <div className="flex h-[60px] items-center gap-2.5 px-5">
          <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="12" fill="var(--ink)" />
            <path d="M32 13 54 51H10Z" fill="var(--critical)" />
          </svg>
          <span className="t-section">QC Alert</span>
        </div>
        <nav aria-label="Dashboard" className="flex flex-col gap-5 pt-2">
          {NAV.map((g) => ({ ...g, items: g.items.filter((n) => !n.roles || n.roles.includes(user.role as Role)) })).filter((g) => g.items.length).map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <p className="t-label px-5 pb-1 text-[11px] text-neutral">{g.group}</p>
              {g.items.map((n) => (
            <NavItem key={n.to} to={n.to} end={n.end} label={n.to === '/dashboard' && user.role === 'supervisor' ? 'My shift' : n.label}>
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
          {inDemo && <SimulatorDock />}
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
          <div ref={pickerRef} className="relative">
          <button type="button" onClick={() => setPicker((p) => !p)} aria-expanded={picker} aria-haspopup="listbox" className="w-full rounded-[10px] px-2 py-2 text-left hover:bg-raised">
            <span className="t-body-strong block">{user.name}</span>
            <span className="t-small text-muted">{ROLE_WORD[user.role]} · switch</span>
          </button>
          {picker && (
            <ul className="anim-fade absolute inset-x-0 bottom-full z-[var(--z-sheet)] mb-2 flex flex-col rounded-[10px] border border-line bg-raised py-1 shadow-sheet">
              <li className="t-label px-3 pb-1 pt-2 text-[10px] text-muted">Switch person</li>
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
                      className={cx('flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sunken', u.id === user.id && 'bg-brand-soft')}
                    >
                      <span className="min-w-0">
                        <span className="t-small-strong block truncate">{u.name}</span>
                        <span className="t-small block text-muted">{ROLE_WORD[u.role]}</span>
                      </span>
                      {u.id === user.id && <span className="t-small-strong shrink-0 text-brand-text">Current</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <TopBar live={live.length} urgent={urgent} />
        <main id="main" className="min-w-0 flex-1 px-4 pt-4 pb-24">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, label, end, children }: { to: string; label: string; end?: boolean; children?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx('mx-3 flex h-10 items-center justify-between rounded-[12px] px-3 t-body', isActive ? 'bg-brand-soft font-semibold text-brand-text' : 'text-muted hover:bg-[var(--surface-raised)] hover:text-ink')
      }
    >
      <span className="flex items-center gap-3">
        {ICON[label]}
        {label}
      </span>
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

const TITLES: [string, string][] = [
  ['/dashboard/tickets', 'Tickets'],
  ['/dashboard/held', 'Held yarn'],
  ['/dashboard/machines', 'Machines'],
  ['/dashboard/insights', 'AI insights'],
  ['/dashboard/report', 'Monthly report'],
  ['/dashboard/rules', 'Rules'],
  ['/dashboard/account', 'Account'],
];

function TopBar({ live, urgent }: { live: number; urgent: boolean }) {
  const nav = useNavigate();
  const user = useUser('dash');
  const { pathname } = useLocation();
  const [q, setQ] = useState('');
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? (user.role === 'supervisor' ? 'My shift' : 'Overview');
  const go = () => {
    const n = q.trim().replace(/\D/g, '');
    if (n) nav(`/dashboard/machines/RF-${n.padStart(2, '0')}`);
    setQ('');
  };
  const iconBtn = 'grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink';
  return (
    <div className="flex h-12 items-center gap-3 px-1">
      <button type="button" aria-label="Back" onClick={() => nav(-1)} className={iconBtn}>
        <ArrowLeft size={18} />
      </button>
      <button type="button" aria-label="Forward" onClick={() => nav(1)} className={iconBtn}>
        <ArrowRight size={18} />
      </button>
      <h1 className="t-body-strong mr-4">{title}</h1>
      <label className="relative mx-auto flex h-10 w-full max-w-[420px] items-center">
        <Search size={16} className="pointer-events-none absolute left-4 text-neutral" />
        <input
          id="quick-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          placeholder="Go to frame, for example 12"
          className="t-small h-full w-full rounded-full bg-raised pr-4 pl-10 outline-none placeholder:text-[var(--neutral-state)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
        />
      </label>
      <NavLink to="/dashboard/tickets" aria-label={`${live} open tickets`} className={cx(iconBtn, 'relative bg-raised')}>
        <Notification size={18} />
        {live > 0 && <span className={cx('absolute top-1.5 right-1.5 size-2.5 rounded-full', urgent ? 'bg-critical' : 'bg-brand')} />}
      </NavLink>
    </div>
  );
}
