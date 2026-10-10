import Logo from './Logo.jsx';
import { OfficialSocials } from './Socials.jsx';

export default function Footer() {
  return (
    <footer className="border-t-4 border-ink bg-onyx text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-4">
          <Logo inverted />
          <OfficialSocials className="text-ink" />
          <a href="mailto:therone@gmail.com" className="text-sm font-bold text-white/80 hover:text-bh-yellow">therone@gmail.com</a>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-white/70">
          Ads are bought by anyone and are not endorsed by Project Throne. Every ad is screened by AI before payment,
          and every outbound click shows its destination first.
        </p>
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
