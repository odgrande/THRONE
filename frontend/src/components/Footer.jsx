import Logo from './Logo.jsx';

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <Logo inverted />
        <p className="max-w-md text-sm leading-relaxed text-white/70">
          Ads are bought by anyone and are not endorsed by Project Throne. Every ad is screened by AI before payment,
          and every outbound click shows its destination first.
        </p>
        <nav className="flex gap-6">
          <a href="/" className="label hover:text-bh-yellow">Throne</a>
          <a href="/kings" className="label hover:text-bh-yellow">Kings</a>
          <a href="/practice" className="label hover:text-bh-yellow">Practice</a>
        </nav>
      </div>
    </footer>
  );
}
