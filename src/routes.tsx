import { Link, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { AlertsScreen, PreviousScreen, RaiseScreen, TestEntryScreen, TicketScreen } from './app/screens';
import { DashShell } from './dashboard/DashShell';
import { HeldYarn, Later, MachinesGrid, TicketDetailPage, Tickets } from './dashboard/pages';
import { Overview } from './dashboard/Overview';
import { Kit } from './demo/Kit';

/** True when built as one self-contained page (claude.ai artifact): no server, memory routing. */
export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';
export const DEMO_HREF = STANDALONE ? '#demo' : '/demo';

function Home() {
  const card = 'flex flex-col gap-1 rounded-[4px] border border-line bg-raised p-5 shadow-raised hover:border-line-strong';
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 bg-surface px-6 py-16 text-ink">
      <div>
        <h1 className="t-page">QC Alert</h1>
        <p className="t-body mt-2 max-w-[60ch] text-muted">
          Catch a yarn fault sooner and make sure the right person fixes it before more bad yarn is made. Interaction Design, UID Gandhinagar, Team 11.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <a href={DEMO_HREF} className={card}>
          <span className="t-body-strong">Jury demo</span>
          <span className="t-small text-muted">Dashboard and phone side by side (laptop)</span>
        </a>
        <Link to="/dashboard" className={card}>
          <span className="t-body-strong">Dashboard</span>
          <span className="t-small text-muted">QC manager and plant head</span>
        </Link>
        <Link to="/app" className={card}>
          <span className="t-body-strong">Alert app</span>
          <span className="t-small text-muted">Supervisor, lab tester, fitter (phone)</span>
        </Link>
      </div>
      <Link to="/kit" className="t-small text-brand hover:underline">
        Component kit
      </Link>
    </main>
  );
}

export const appRoutes: RouteObject = {
  path: '/app',
  element: <AppShell />,
  children: [
    { index: true, element: <AlertsScreen /> },
    { path: 'ticket/:id', element: <TicketScreen /> },
    { path: 'test/:id', element: <TestEntryScreen /> },
    { path: 'raise', element: <RaiseScreen /> },
    { path: 'previous', element: <PreviousScreen /> },
  ],
};

export const dashRoutes: RouteObject = {
  path: '/dashboard',
  element: <DashShell />,
  children: [
    { index: true, element: <Overview /> },
    { path: 'tickets', element: <Tickets /> },
    { path: 'tickets/:id', element: <TicketDetailPage /> },
    { path: 'held', element: <HeldYarn /> },
    { path: 'machines', element: <MachinesGrid /> },
    { path: 'machines/:id', element: <MachinesGrid /> },
    { path: 'insights', element: <Later title="AI insights" what="Repeat fault patterns, likely causes, frames to test sooner and suggested rule changes, each with confidence and evidence." /> },
    { path: 'report', element: <Later title="Monthly report" what="Alerts, kg held and saved, response times by shift, top causes, worst frames, and PDF export." /> },
    { path: 'rules', element: <Later title="Rules" what="The six-step rule editor with a preview of last month’s impact. Only the QC manager can save." /> },
    { path: 'account', element: <Later title="Account" what="Profile, people and roles, shifts and roster, notifications." /> },
  ],
};

export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/kit', element: <Kit /> },
  appRoutes,
  dashRoutes,
  { path: '*', element: <Navigate to="/" replace /> },
];
