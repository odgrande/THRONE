import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Logo from './Logo.jsx';
import SoundControls from './SoundControls.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const NAV = [
  { href: '/', label: 'The Throne' },
  { href: '/kings', label: 'History of Kings' },
  { href: '/practice', label: 'Practice' },
];

export default function Header({ children }) {
  const [open, setOpen] = useState(false);
  const path = window.location.pathname;

  const navLink = (item) => (
    <a
      key={item.href}
      href={item.href}
      aria-current={path === item.href ? 'page' : undefined}
      className={`label transition duration-200 hover:text-bh-red ${path === item.href ? 'text-bh-red' : ''}`}
    >
      {item.label}
    </a>
  );

  return (
    <header className="border-b-4 border-ink bg-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">{NAV.map(navLink)}</nav>
        </div>
        <div className="flex items-center gap-3">
          {children}
          {/* On every page, so music and effects follow the visitor around the site. */}
          <SoundControls />
          <ThemeToggle />
          <button
            className="btn-outline btn-sm md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-4 w-4" strokeWidth={3} /> : <Menu className="h-4 w-4" strokeWidth={3} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col gap-4 border-t-2 border-ink bg-bh-yellow px-4 py-4 md:hidden">{NAV.map(navLink)}</nav>
      )}
    </header>
  );
}
