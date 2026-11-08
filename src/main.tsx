import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import './fonts';
import './styles/base.css';
import { routes, STANDALONE } from './routes';
import { DemoPage } from './demo/DemoPage';

// Standalone build: plain #names pick the start view (#app, #dashboard, #demo).
const SECTIONS = ['app', 'dashboard', 'kit'];
const start = () => {
  const h = location.hash.replace('#', '');
  return SECTIONS.includes(h) ? `/${h}` : '/';
};

const router = STANDALONE ? createMemoryRouter(routes, { initialEntries: [start()] }) : createBrowserRouter(routes);

if (STANDALONE) {
  router.subscribe(({ location: l }) => {
    const section = l.pathname.split('/')[1];
    try {
      history.replaceState(null, '', section ? `#${section}` : location.pathname + location.search);
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
      const h = location.hash.replace('#', '');
      if (SECTIONS.includes(h) && !router.state.location.pathname.startsWith(`/${h}`)) void router.navigate(`/${h}`);
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
