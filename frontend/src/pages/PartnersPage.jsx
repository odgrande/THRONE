import { useEffect, useState } from 'react';
import { Building2, Handshake, Megaphone, TrendingUp } from 'lucide-react';
import { API_URL } from '../lib/api.js';
import InfoPage, { SectionTitle } from '../components/InfoPage.jsx';
import ContactForm from '../components/ContactForm.jsx';

const WHO = [
  { icon: Megaphone, title: 'Agencies and resellers', body: 'Bring your clients to the billboard, the Spotlight and the Market, and grow with us.' },
  { icon: Building2, title: 'Brands and sponsors', body: 'Campaign packages across both editions, King of the Day moments and featured placements.' },
  { icon: Handshake, title: 'Communities and creators', body: 'Markets, hubs, events and creators who want to put local businesses in front of more people.' },
  { icon: TrendingUp, title: 'Investors', body: 'Help us take the live billboard to more cities and countries.' },
];

const BUILT = [
  'A live billboard everyone sees at once, with no signup',
  'Two editions: Nigeria (Naira, Paystack) and Global (US dollars)',
  'Five ways to advertise, from a ₦300 Market stall to the Throne auction',
  'Pidgin, Yoruba, Hausa and Igbo, alongside English',
  'Ads screened before payment, reviewed in Nigeria, and a safety page before every click',
  'Real reach and click numbers for every advertiser',
];

// Real numbers only: shown once the site has traffic to report.
function LiveNumbers() {
  const [s, setS] = useState(null);
  useEffect(() => {
    Promise.all(['ng', 'global'].map((r) => fetch(`${API_URL}/api/state?region=${r}`).then((x) => x.json()))).then(setS, () => {});
  }, []);
  if (!s) return null;
  const sum = (f) => s.reduce((a, x) => a + (f(x) ?? 0), 0);
  const visitors = sum((x) => x.performance?.visitors7d);
  const ads = sum((x) => x.stats?.ads);
  const businesses = sum((x) => x.stats?.advertisers);
  if (!visitors && !ads) return null;
  const cells = [
    ['Visitors, last 7 days', visitors],
    ['Ads placed', ads],
    ['Businesses advertised', businesses],
  ];
  return (
    <dl className="grid grid-cols-1 gap-1 border-2 border-ink bg-ink sm:grid-cols-3">
      {cells.map(([label, n]) => (
        <div key={label} className="bg-paper p-4 text-center">
          <dt className="label text-ink/60">{label}</dt>
          <dd className="mt-1 text-3xl font-black tabular-nums">{n.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function PartnersPage() {
  return (
    <InfoPage
      kicker="Partners & investors"
      title="Grow the throne with us."
      intro="Throne turns the internet’s most famous ad idea into a live, fair marketplace for businesses of every size. We are looking for partners who want to build it with us."
      tone="bg-onyx text-white"
    >
      <LiveNumbers />

      <SectionTitle id="who">Who we work with</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {WHO.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-5">
            <Icon className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
            <p className="mt-2 text-lg font-black uppercase tracking-tight">{title}</p>
            <p className="mt-1 leading-relaxed text-ink/75">{body}</p>
          </div>
        ))}
      </div>

      <SectionTitle id="built">What is already built</SectionTitle>
      <ul className="card grid gap-2 p-5 sm:grid-cols-2">
        {BUILT.map((b) => (
          <li key={b} className="flex gap-2 font-medium">
            <span className="mt-2 h-2 w-2 shrink-0 rotate-45 bg-bh-red" aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>

      <SectionTitle id="talk">Talk to us</SectionTitle>
      <ContactForm topics={['partner', 'investor', 'press']} defaultTopic={new URLSearchParams(window.location.search).get('topic') === 'investor' ? 'investor' : 'partner'} withCompany />
      <p className="text-xs leading-relaxed text-ink/60">
        Throne is owned and operated by Odgrande NG Limited (RC1029807). Nothing on this page is an offer to sell, or a request for an offer to buy, shares or any other
        investment.
      </p>
    </InfoPage>
  );
}
