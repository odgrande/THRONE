import ThronePage from './pages/ThronePage.jsx';
import KingsPage from './pages/KingsPage.jsx';
import GoPage from './pages/GoPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import PracticePage from './pages/PracticePage.jsx';
import LegalPage from './pages/LegalPage.jsx';
import { useEffect } from 'react';
import CookieNotice from './components/CookieNotice.jsx';
import { api } from './lib/api.js';
import { adoptRegion, chosenRegion } from './lib/region.js';
import { hidePreloader } from './lib/preloader.js';

// A handful of pages, so plain path matching instead of a router dependency.
function Page() {
  const path = window.location.pathname;
  const go = /^\/go\/([0-9a-f-]{36})$/i.exec(path);
  if (go) return <GoPage bidId={go[1]} />;
  if (path === '/kings') return <KingsPage />;
  if (path === '/admin') return <AdminPage />;
  if (path === '/practice') return <PracticePage />;
  if (path === '/legal') return <LegalPage />;
  return <ThronePage />;
}

export default function App() {
  // First visit with no saved edition: ask the server which one this
  // visitor's country gets (pages that load state learn it from there too).
  useEffect(() => {
    if (!chosenRegion()) api.getGeo().then((g) => adoptRegion(g.suggestedRegion), () => {});
    // The home page hides the preloader once the live billboard has loaded;
    // every other page as soon as it renders.
    if (window.location.pathname !== '/') hidePreloader();
  }, []);
  return (
    <>
      <Page />
      <CookieNotice />
    </>
  );
}
