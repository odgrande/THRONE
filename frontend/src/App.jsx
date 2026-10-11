import { lazy, Suspense, useEffect } from 'react';
import ThronePage from './pages/ThronePage.jsx';
import CookieNotice from './components/CookieNotice.jsx';
import MusicButton from './components/MusicButton.jsx';
import { api } from './lib/api.js';
import { adoptRegion, chosenRegion } from './lib/region.js';
import { hidePreloader } from './lib/preloader.js';

// The home page ships in the main bundle; every other page loads only when
// opened, which keeps the first load small on mobile data.
const KingsPage = lazy(() => import('./pages/KingsPage.jsx'));
const GoPage = lazy(() => import('./pages/GoPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const PracticePage = lazy(() => import('./pages/PracticePage.jsx'));
const LegalPage = lazy(() => import('./pages/LegalPage.jsx'));
const MyAdsPage = lazy(() => import('./pages/MyAdsPage.jsx'));
const SafetyPage = lazy(() => import('./pages/SafetyPage.jsx'));
const FaqPage = lazy(() => import('./pages/FaqPage.jsx'));
const ContactPage = lazy(() => import('./pages/ContactPage.jsx'));
const PartnersPage = lazy(() => import('./pages/PartnersPage.jsx'));

const ROUTES = {
  '/kings': KingsPage,
  '/admin': AdminPage,
  '/practice': PracticePage,
  '/legal': LegalPage,
  '/my-ads': MyAdsPage,
  '/safety': SafetyPage,
  '/faq': FaqPage,
  '/contact': ContactPage,
  '/partners': PartnersPage,
};

// A handful of pages, so plain path matching instead of a router dependency.
function Page() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const go = /^\/go\/([0-9a-f-]{36})$/i.exec(path);
  if (go) return <GoPage bidId={go[1]} />;
  const Route = ROUTES[path];
  return Route ? <Route /> : <ThronePage />;
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
      <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
        <Page />
      </Suspense>
      <CookieNotice />
      <MusicButton />
    </>
  );
}
