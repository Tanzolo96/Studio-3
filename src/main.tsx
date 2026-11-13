import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import './fonts';
import './styles/base.css';
import { routes, STANDALONE } from './routes';
import { DemoPage } from './demo/DemoPage';

// Standalone build: the page lives in a plain #name so a refresh lands on the same page.
// '/dashboard/report' is stored as '#dashboard--report' (the viewer only passes plain #names).
const SECTIONS = ['app', 'dashboard', 'kit'];
const pathFromHash = () => {
  const h = location.hash.replace('#', '');
  const parts = h.split('--').filter(Boolean);
  return parts.length && SECTIONS.includes(parts[0]) && parts.every((x) => /^[A-Za-z0-9-]+$/.test(x)) ? `/${parts.join('/')}` : '/';
};
const hashFromPath = (pathname: string) => pathname.split('/').filter(Boolean).join('--');
const start = pathFromHash;

const router = STANDALONE ? createMemoryRouter(routes, { initialEntries: [start()] }) : createBrowserRouter(routes);

if (STANDALONE) {
  router.subscribe(({ location: l }) => {
    const h = hashFromPath(l.pathname);
    try {
      history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
    } catch {
      /* the viewer may not allow it */
    }
  });
}

const isDemo = () => location.pathname === '/demo' || location.hash === '#demo';

function Root() {
  const [demo, setDemo] = useState(isDemo);
  useEffect(() => {
    const on = () => {
      setDemo(isDemo());
      const path = pathFromHash();
      if (path !== '/' && router.state.location.pathname !== path) void router.navigate(path);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return demo ? <DemoPage /> : <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
