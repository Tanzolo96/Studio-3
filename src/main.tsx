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
const valid = (path: string | null) => {
  if (!path || path === '/') return null;
  const parts = path.split('/').filter(Boolean);
  return parts.length && SECTIONS.includes(parts[0]) && parts.every((x) => /^[A-Za-z0-9-]+$/.test(x)) ? `/${parts.join('/')}` : null;
};
const pathFromHash = () => valid('/' + location.hash.replace('#', '').split('--').join('/'));
const hashFromPath = (pathname: string) => pathname.split('/').filter(Boolean).join('--');
const KEY = 'qc.path';
const saved = () => {
  for (const s of [() => sessionStorage, () => localStorage]) {
    try {
      const v = valid(s().getItem(KEY));
      if (v) return v;
    } catch {
      /* storage blocked */
    }
  }
  return null;
};
// A link with a #name wins; otherwise come back to the page this tab was on before the refresh.
const start = () => pathFromHash() ?? saved() ?? '/';

const router = STANDALONE ? createMemoryRouter(routes, { initialEntries: [start()] }) : createBrowserRouter(routes);

if (STANDALONE) {
  router.subscribe(({ location: l }) => {
    for (const s of [() => sessionStorage, () => localStorage]) {
      try {
        s().setItem(KEY, l.pathname);
      } catch {
        /* storage blocked */
      }
    }
    const h = hashFromPath(l.pathname);
    if (location.hash.replace('#', '') === h) return;
    try {
      // location.replace fires hashchange, which the artifact viewer listens to for its own address bar.
      location.replace(h ? `#${h}` : '#');
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
      if (path && router.state.location.pathname !== path) void router.navigate(path);
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
