import Logo from './Logo.jsx';
import { OfficialSocials } from './Socials.jsx';
import { t } from '../lib/i18n.js';

export default function Footer() {
  return (
    <footer className="border-t-4 border-ink bg-onyx text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-4">
          <Logo inverted />
          <OfficialSocials className="text-ink" />
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-white/70">{t('footer.short')}</p>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          {[
            ['/', 'Advertise'],
            ['/kings', 'Kings'],
            ['/practice', 'Practice'],
            ['/my-ads', 'My ads'],
            ['/faq', 'FAQ'],
            ['/safety', 'Safety'],
            ['/contact', 'Contact'],
            ['/partners', 'Partners'],
            ['/legal', 'Terms & Privacy'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="label hover:text-bh-yellow">
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
