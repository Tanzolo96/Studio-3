import { useEffect, useState } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { Add, Notification, RecentlyViewed } from '@carbon/icons-react';
import { useMillState, useNow, useSession, useTheme, useUser } from '../store/store';
import { fitterJobs, myTickets, pendingRequests } from '../engine/selectors';
import { hhmm, shiftAt } from '../engine/time';
import { cx } from '../ui/primitives';
import { soundReady, unlock } from '../ui/sound';
import { TakeoverLayer } from './Takeover';
import { Onboarding, PersonSheet } from './Person';

export function AppShell() {
  const theme = useTheme('app');
  const s = useMillState();
  const now = useNow();
  const user = useUser('app');
  const [params] = useSearchParams();
  const setUser = useSession((x) => x.setUser);
  const [ready, setReady] = useState(() => {
    try {
      return localStorage.getItem('qc.app.ready') === '1';
    } catch {
      return true;
    }
  });
  const [sound, setSound] = useState(soundReady());
  const [person, setPerson] = useState(false);

  useEffect(() => {
    const as = params.get('as');
    if (as && s.users.some((u) => u.id === as)) setUser('app', as);
    if (params.get('ready') === '1') setReady(true);
  }, [params, s.users, setUser]);

  useEffect(() => {
    if (sound) return;
    const on = () => {
      unlock();
      setTimeout(() => setSound(soundReady()), 50);
    };
    window.addEventListener('pointerdown', on);
    return () => window.removeEventListener('pointerdown', on);
  }, [sound]);

  const count =
    user.role === 'tester' ? pendingRequests(s).length : user.role === 'fitter' ? fitterJobs(s, user.id).length : myTickets(s, user, now).filter((t) => t.status !== 'fixed').length;

  return (
    <div data-theme={theme} className="grid min-h-dvh place-items-center bg-surface text-ink sm:bg-[var(--surface-sunken)] sm:py-6">
      <div className="phone relative flex h-dvh w-full flex-col overflow-hidden bg-surface sm:h-[844px] sm:max-h-[calc(100dvh-48px)] sm:w-[390px] sm:rounded-[40px] sm:border-[10px] sm:border-[#161616] sm:shadow-sheet">
        <div className="flex h-9 shrink-0 items-center justify-between px-5 pt-1 text-[13px] font-semibold tabular-nums">
          <span className="font-mono">{hhmm(now)}</span>
          <button type="button" onClick={() => setPerson(true)} className="t-small-strong -mr-2 flex h-9 items-center gap-2 rounded-full px-2 hover:bg-sunken" aria-label={`Signed in as ${user.name}. Switch person or theme`}>
            <span className="text-muted">
              {user.shift === 'G' ? 'Day' : `${user.shift} shift`}
              {user.shift !== 'G' && user.shift !== shiftAt(now) ? ' (off)' : ''}
            </span>
            <span className="grid size-7 place-items-center rounded-full bg-ink text-[11px] font-semibold text-surface">{user.name.split(' ').map((p) => p[0]).join('')}</span>
          </button>
        </div>
        {ready && !sound && (
          <button type="button" onClick={() => unlock()} className="t-small-strong mx-4 mb-1 rounded-[4px] bg-brand-soft px-3 py-2 text-left text-ink">
            Tap anywhere to turn on alert sound
          </button>
        )}
        <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </main>
        <nav aria-label="App" className="grid h-16 shrink-0 grid-cols-3 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)]">
          <Tab to="/app" end icon={<Notification size={20} />} label="Alerts" badge={count} />
          <Tab to="/app/raise" icon={<Add size={20} />} label="Raise ticket" />
          <Tab to="/app/previous" icon={<RecentlyViewed size={20} />} label="Previous" />
        </nav>
        {ready && <TakeoverLayer s={s} user={user} now={now} />}
        {person && <PersonSheet onClose={() => setPerson(false)} />}
        {!ready && (
          <Onboarding
            onDone={() => {
              unlock();
              setSound(true);
              try {
                localStorage.setItem('qc.app.ready', '1');
              } catch {
                /* ignore */
              }
              setReady(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Tab({ to, icon, label, badge, end }: { to: string; icon: React.ReactNode; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx('relative flex flex-col items-center justify-center gap-1 text-[13px] leading-4', isActive ? 'font-semibold text-brand' : 'text-muted hover:text-ink')
      }
    >
      <span className="relative">
        {icon}
        {!!badge && (
          <span className="t-data absolute -top-1.5 left-3.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-critical px-1 text-[11px] leading-none text-on-critical">
            {badge}
          </span>
        )}
      </span>
      {label}
    </NavLink>
  );
}
