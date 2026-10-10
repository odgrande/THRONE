import ThronePage from './pages/ThronePage.jsx';
import KingsPage from './pages/KingsPage.jsx';
import GoPage from './pages/GoPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import PracticePage from './pages/PracticePage.jsx';

// A handful of pages, so plain path matching instead of a router dependency.
export default function App() {
  const path = window.location.pathname;
  const go = /^\/go\/([0-9a-f-]{36})$/i.exec(path);
  if (go) return <GoPage bidId={go[1]} />;
  if (path === '/kings') return <KingsPage />;
  if (path === '/admin') return <AdminPage />;
  if (path === '/practice') return <PracticePage />;
  return <ThronePage />;
}
