import { useEffect, useState } from 'react';
import { BadgeCheck, Crown, Loader2, ShieldCheck, Timer, Zap } from 'lucide-react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Court, { Market, Spotlight } from '../components/Court.jsx';
import ProofStrip from '../components/ProofStrip.jsx';
import { setTermsVersion } from '../components/AcceptRules.jsx';
import { api, formatMoney } from '../lib/api.js';
import { adoptProcessor, adoptRegion } from '../lib/region.js';
import { setCoinRules } from '../lib/wallet.js';

// For businesses: every paid space in one place. No game, no account: pick a
// space, pay, and the ad goes live on every screen. (The Throne itself is
// won in the free daily race, not sold.)
export default function AdvertisePage() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const openId = new URLSearchParams(window.location.search).get('board');

  useEffect(() => {
    api.getState().then(
      (s) => {
        adoptRegion(s.region);
        adoptProcessor(s.paymentsMode);
        setTermsVersion(s.rules?.termsVersion);
        setCoinRules(s.rules?.coins, s.rules?.game);
        setState(s);
      },
      (err) => setError(err.message),
    );
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!state) {
    return (
      <div className="min-h-screen bg-canvas">
        <Header />
        <p className="label flex items-center justify-center gap-2 py-24">{error ?? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} />}</p>
      </div>
    );
  }

  const r = state.rules;
  const boards = state.boards;
  const fromDay = (tier) => {
    const list = boards.filter((b) => (tier === 'court' ? !b.tier || b.tier === 'court' : b.tier === tier));
    return list.length ? Math.min(...list.map((b) => b.prices[7] / 7)) : null;
  };
  const tiers = [
    { id: 'court', name: 'The Court', what: 'Two big boards right under the Throne. Picture or video, optional business map.', price: fromDay('court') },
    { id: 'spotlight', name: 'The Spotlight', what: 'Ten featured spaces. Picture or video.', price: fromDay('spotlight') },
    { id: 'market', name: 'The Market', what: 'Twelve small stalls at a price anyone can afford. Picture.', price: fromDay('market') },
  ];
  const props = { boards, now, mapAddonCents: r.mapAddonCents, videoAddonCents: r.videoAddonCents, performance: state.performance, defaultPay: 'card', openId };

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas">
      <Header />
      {state.paymentsMode === 'demo' && (
        <p className="border-b-2 border-ink bg-muted px-4 py-2 text-center text-xs font-bold uppercase tracking-wider">Test site · payments are simulated</p>
      )}

      <section className="border-b-4 border-ink">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-5 lg:px-8 lg:py-14">
          <div className="lg:col-span-3">
            <p className="label text-bh-blue">Advertise on Throne</p>
            <h1 className="display mt-2 text-5xl sm:text-7xl">
              Your ad. Live. <span className="text-bh-red">In minutes.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg font-medium text-ink/80">
              No game, no account. Pick a space, pay, and your ad goes live on every screen at the same time, for the days you paid. Nobody can knock it off.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                [Zap, 'Live in minutes', state.region === 'ng' ? 'After a short review (about 5 minutes).' : 'As soon as your payment clears.'],
                [Timer, 'Guaranteed days', 'Book 1, 3 or 7 days. The 7-day package is cheapest per day.'],
                [ShieldCheck, 'Safe for your brand', 'Every ad and link is screened. Reports are reviewed by a person.'],
                [BadgeCheck, 'Real results', 'See your reach and clicks on My ads.'],
              ].map(([Icon, k, v]) => (
                <li key={k} className="flex gap-3 border-2 border-ink bg-paper p-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={3} />
                  <span>
                    <span className="block font-black uppercase tracking-tight">{k}</span>
                    <span className="text-sm text-ink/75">{v}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <aside className="space-y-4 lg:col-span-2">
            <div className="border-4 border-ink bg-paper shadow-hard-md">
              <p className="label border-b-4 border-ink bg-bh-yellow px-4 py-2">Prices ({state.regions.find((x) => x.id === state.region)?.currency})</p>
              <ul className="divide-y-2 divide-ink/10">
                {tiers.map((tr) => (
                  <li key={tr.id}>
                    <a href={`#${tr.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-bh-cream">
                      <span>
                        <span className="block font-black uppercase">{tr.name}</span>
                        <span className="text-sm text-ink/70">{tr.what}</span>
                      </span>
                      {tr.price != null && (
                        <span className="shrink-0 text-right">
                          <span className="block text-xs text-ink/60">from</span>
                          <span className="font-black tabular-nums">{formatMoney(Math.ceil(tr.price))}</span>
                          <span className="block text-xs text-ink/60">/day</span>
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="border-t-2 border-ink px-4 py-2 text-xs text-ink/70">
                Add-ons: video {formatMoney(r.videoAddonCents)} · business map {formatMoney(r.mapAddonCents)}.
                {r.vatPct > 0 ? ` Prices include ${r.vatPct}% VAT.` : ''}
              </p>
            </div>
            <ProofStrip performance={state.performance} />
            <a href="/" className="flex items-center gap-3 border-4 border-ink bg-bh-blue p-4 text-white shadow-hard-sm hover:opacity-95">
              <Crown className="h-8 w-8 shrink-0" strokeWidth={2.5} />
              <span>
                <span className="block font-black uppercase">Want the big billboard?</span>
                <span className="text-sm text-white/85">The Throne can’t be bought: it’s won in the free daily puzzle race. Play →</span>
              </span>
            </a>
          </aside>
        </div>
      </section>

      {/* The Court section carries id="court" itself. */}
      <Court {...props} />
      <div id="spotlight" className="scroll-mt-4">
        <Spotlight {...props} />
      </div>
      <div id="market" className="scroll-mt-4">
        <Market {...props} />
      </div>

      <section className="border-b-4 border-ink bg-paper">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            ['How do I pay?', state.region === 'ng' ? 'Card, bank transfer or USSD through Paystack, in Naira. You pay on Paystack’s secure page.' : 'Card or bank through Flutterwave, in US dollars. You pay on Flutterwave’s secure page.'],
            ['Can I get a refund?', 'Once your ad has gone live, the payment is non-refundable. If your ad is rejected in review, or can’t be placed, you are refunded in full automatically. The details are in the Terms.'],
            ['What isn’t allowed?', 'Scams, misleading claims, adult content, hate, violence, illegal products, unlicensed gambling, impersonation and political or advocacy ads. See the Ad Policy.'],
          ].map(([q, a]) => (
            <div key={q}>
              <h2 className="font-black uppercase tracking-tight">{q}</h2>
              <p className="mt-1 text-sm text-ink/75">{a}</p>
            </div>
          ))}
          <p className="text-sm md:col-span-3">
            Bought before? See your ads’ reach and clicks on{' '}
            <a href="/my-ads" className="font-bold underline hover:text-bh-red">
              My ads
            </a>
            . Questions:{' '}
            <a href="mailto:therone@gmail.com?subject=Advertising" className="font-bold underline hover:text-bh-red">
              therone@gmail.com
            </a>
            .
          </p>
        </div>
      </section>
      <Footer />
    </div>
  );
}
