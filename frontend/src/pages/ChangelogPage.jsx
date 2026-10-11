import InfoPage from '../components/InfoPage.jsx';

// What changed, newest first. Add an entry for every release people would
// notice; keep it in plain words.
const RELEASES = [
  {
    version: '0.6',
    date: '11 October 2026',
    title: 'Clearer, safer, simpler',
    items: [
      'You land on the right edition (Nigeria or Global) automatically, by location.',
      'Support is now by email: therone@gmail.com.',
      'New Safety & security page, FAQ, Partners page, sitemap and this changelog.',
      'Before paying, you see exactly what you are buying and accept the rules (saved with your ad).',
      'It is clear everywhere: ads that have gone live are non-refundable; the automatic refunds are listed in the Terms.',
      'Refunds can never get lost: if a payment provider refuses one, we keep retrying until it is paid.',
    ],
  },
  {
    version: '0.5',
    date: '11 October 2026',
    title: 'Video ads, real results, new spaces',
    items: [
      'Video ads on the Throne, the Court and the Spotlight, checked by a person before they go live.',
      'Real reach and click numbers for every ad, and My ads to see your own results.',
      'The Spotlight (10 featured spaces) and the Market (12 low-cost stalls).',
      'In Nigeria every ad is reviewed for about 5 minutes before it goes live, and political ads are blocked.',
    ],
  },
  {
    version: '0.4',
    date: '10 October 2026',
    title: 'Throne Nigeria',
    items: [
      'A Naira throne for Nigeria with Paystack (card, bank transfer, USSD).',
      'Pidgin, Yoruba, Hausa and Igbo.',
      'Global edition payments in US dollars with Flutterwave.',
      'Afro-groove background music, a new preloader and the billboard first on every screen.',
    ],
  },
  {
    version: '0.1',
    date: '10 October 2026',
    title: 'The throne opens',
    items: [
      'One live billboard everyone sees at once: pay more than the current ad to replace it.',
      'Smaller boards with guaranteed days, King of the Day, the History of Kings archive and a practice arena.',
      'Every ad screened before payment, and a safety page before every click-out.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <InfoPage kicker="Changelog" title="What’s new." intro="Everything we have shipped, newest first." tone="bg-bh-yellow text-ink">
      <ol className="space-y-6">
        {RELEASES.map((r) => (
          <li key={r.version} className="card p-5 sm:p-6">
            <p className="label text-ink/60">
              v{r.version} · {r.date}
            </p>
            <h2 className="mt-1 text-xl font-black uppercase tracking-tight sm:text-2xl">{r.title}</h2>
            <ul className="mt-3 space-y-1.5 text-sm leading-relaxed sm:text-base">
              {r.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-bh-red" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </InfoPage>
  );
}
