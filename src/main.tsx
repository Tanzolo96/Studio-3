import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/base.css';
import { AppShell } from './app/AppShell';
import { AlertsScreen, PreviousScreen, RaiseScreen, TestEntryScreen, TicketScreen } from './app/screens';
import { DashShell } from './dashboard/DashShell';
import { HeldYarn, Later, MachinesGrid, Overview, TicketDetailPage, Tickets } from './dashboard/pages';
import { DemoPage } from './demo/DemoPage';
import { Kit } from './demo/Kit';

function Home() {
  const link = 'flex flex-col gap-1 rounded-[4px] border border-line bg-raised p-5 shadow-raised hover:border-line-strong';
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="t-page">QC Alert</h1>
        <p className="t-body mt-2 max-w-[60ch] text-muted">
          Catch a yarn fault sooner and make sure the right person fixes it before more bad yarn is made. Interaction Design, UID Gandhinagar, Team 11.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/demo" className={link}>
          <span className="t-body-strong">Jury demo</span>
          <span className="t-small text-muted">Dashboard and phone side by side</span>
        </Link>
        <Link to="/dashboard" className={link}>
          <span className="t-body-strong">Dashboard</span>
          <span className="t-small text-muted">QC manager and plant head</span>
        </Link>
        <Link to="/app" className={link}>
          <span className="t-body-strong">Alert app</span>
          <span className="t-small text-muted">Supervisor, lab tester, fitter</span>
        </Link>
      </div>
      <Link to="/kit" className="t-small text-brand hover:underline">
        Component kit
      </Link>
    </main>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/demo', element: <DemoPage /> },
  { path: '/kit', element: <Kit /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <AlertsScreen /> },
      { path: 'ticket/:id', element: <TicketScreen /> },
      { path: 'test/:id', element: <TestEntryScreen /> },
      { path: 'raise', element: <RaiseScreen /> },
      { path: 'previous', element: <PreviousScreen /> },
    ],
  },
  {
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
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
