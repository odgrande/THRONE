import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Logo from './Logo.jsx';
import SoundControls from './SoundControls.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import LanguagePicker from './LanguagePicker.jsx';
import WalletChip from './WalletChip.jsx';
import { t } from '../lib/i18n.js';
import { ownedAds } from '../lib/owned.js';

const NAV = [
  { href: '/', key: 'nav.throne' },
  { href: '/kings', key: 'nav.kings' },
  { href: '/advertise', key: 'nav.advertise' },
  { href: '/practice', key: 'nav.practice' },
  { href: '/invite', key: 'nav.invite' },
];
const MY_ADS = { href: '/my-ads', key: 'nav.myAds' };

export default function Header({ children }) {
  const [open, setOpen] = useState(false);
  const path = window.location.pathname;
  const nav = ownedAds().length > 0 || path === '/my-ads' ? [...NAV, MY_ADS] : NAV;

  const navLink = (item) => (
    <a
      key={item.href}
      href={item.href}
      aria-current={path === item.href ? 'page' : undefined}
      className={`label whitespace-nowrap transition duration-200 hover:text-bh-red ${path === item.href ? 'text-bh-red' : ''}`}
    >
      {t(item.key)}
    </a>
  );

  return (
    <header className="border-b-4 border-ink bg-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-4 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 xl:gap-10">
          <Logo />
          <nav className="hidden items-center gap-5 lg:flex xl:gap-7">{nav.map(navLink)}</nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {children}
          <WalletChip />
          <div className="hidden md:block">
            <LanguagePicker />
          </div>
          {/* On every page, so music and effects follow the visitor around the site.
              Phones get them in the menu, to keep the header on one line. */}
          <div className="hidden md:block">
            <SoundControls />
          </div>
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          <button
            className="btn-outline btn-sm lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-4 w-4" strokeWidth={3} /> : <Menu className="h-4 w-4" strokeWidth={3} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t-2 border-ink bg-bh-yellow px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-4">
            {nav.map(navLink)}
            {[
              ['/faq', 'FAQ'],
              ['/safety', 'Safety'],
              ['/contact', 'Contact'],
              ['/partners', 'Partners'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="label hover:text-bh-red">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <LanguagePicker />
            <SoundControls />
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
