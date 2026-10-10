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
          <a href="mailto:therone@gmail.com" className="text-sm font-bold text-white/80 hover:text-bh-yellow">therone@gmail.com</a>
        </div>
        <div className="max-w-md space-y-2 text-sm leading-relaxed text-white/70">
          <p>
            <span className="font-bold text-white">{t('notice.title')}</span> {t('notice.body')}
          </p>
          <p>{t('footer.safety')}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3">
          <a href="/" className="label hover:text-bh-yellow">Advertise</a>
          <a href="/kings" className="label hover:text-bh-yellow">Kings</a>
          <a href="/practice" className="label hover:text-bh-yellow">Practice</a>
          <a href="/legal" className="label hover:text-bh-yellow">Terms &amp; Privacy</a>
        </nav>
      </div>
    </footer>
  );
}
