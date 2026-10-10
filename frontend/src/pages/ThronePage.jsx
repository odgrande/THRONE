import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { minNextBidCents } from '../lib/rules.js';
import { t } from '../lib/i18n.js';
import { hidePreloader } from '../lib/preloader.js';
import { activeRegion, adoptProcessor, adoptRegion } from '../lib/region.js';
import { gsap, reducedMotion, useGSAP } from '../lib/motion.js';
import { announceCrowned, announceTakeover, sfx } from '../lib/sound.js';
import CrownBand from '../components/CrownBand.jsx';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Shape from '../components/Shape.jsx';
import Billboard, { BillboardStats } from '../components/Billboard.jsx';
import BidForm from '../components/BidForm.jsx';
import StatsStrip from '../components/StatsStrip.jsx';
import Court, { Market } from '../components/Court.jsx';
import MapCard from '../components/MapCard.jsx';
import Showcase from '../components/Showcase.jsx';
import Ticker from '../components/Ticker.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import LiveAudience from '../components/LiveAudience.jsx';
import { RecentlyDethroned, RelegationBanner, useRelegationOffer } from '../components/Relegation.jsx';

// Ticks every 250 ms, corrected for clock skew against the server.
function useServerNow(offsetMs) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetMs), 250);
    return () => clearInterval(id);
  }, [offsetMs]);
  return now;
}

export default function ThronePage() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [audience, setAudience] = useState({ visitsToday: 0, peakToday: 0 });
  const [banner, setBanner] = useState(null);
  const [dethronedBidId, setDethronedBidId] = useState(null);
  const [offer, dismissOffer] = useRelegationOffer(dethronedBidId);
  const page = useRef(null);
  const bannerRef = useRef(null);
  const now = useServerNow(offsetMs);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getState();
      // Later requests, prices and the live feed follow the region the server chose.
      adoptRegion(next.region);
      adoptProcessor(next.paymentsMode);
      setOffsetMs(Date.parse(next.serverTime) - Date.now());
      setState(next);
      setLoadError(null);
      hidePreloader();
    } catch (err) {
      setLoadError(err.message);
      hidePreloader();
    }
  }, []);

  useEffect(() => {
    refresh();
    const events = new EventSource(api.eventsUrl());
    // One feed carries every region's events; act only on this edition's.
    const ours = (e) => {
      const data = JSON.parse(e.data);
      return !data.region || data.region === activeRegion() ? data : null;
    };
    events.addEventListener('takeover', (e) => {
      const data = ours(e);
      if (!data) return;
      refresh();
      // If this browser owned the dethroned ad, it gets the relegation offer.
      if (data.previousBidId) setDethronedBidId(data.previousBidId);
      const price = formatMoney(data.throne.amountCents);
      setBanner(
        data.previousName
          ? `${data.throne.name} knocked ${data.previousName} off the throne for ${price}!`
          : `${data.throne.name} claimed the throne for ${price}!`,
      );
      // Crash + stamp, in time with the billboard drop animation (no-op if sound is off).
      announceTakeover(data, price);
    });
    events.addEventListener('crowned', (e) => {
      const data = ours(e);
      if (!data) return;
      refresh();
      setBanner(`👑 ${data.name} is King of the Day!`);
      announceCrowned(data.name);
    });
    events.addEventListener('retired', (e) => {
      const data = ours(e);
      if (!data) return;
      refresh();
      sfx.retired();
      setBanner(`${data.name} served the full term and retires. The throne is open!`);
    });
    events.addEventListener('booked', (e) => {
      if (!ours(e)) return;
      refresh();
      sfx.booked();
    });
    // A takedown or a restore: refetch so every screen updates.
    events.addEventListener('removed', (e) => ours(e) && refresh());
    events.addEventListener('viewers', (e) => {
      const data = JSON.parse(e.data);
      setViewers(data.count);
      setAudience({ visitsToday: data.visitsToday ?? 0, peakToday: data.peakToday ?? 0 });
    });
    // Resync after a dropped connection, in case events were missed.
    events.addEventListener('open', refresh);
    return () => events.close();
  }, [refresh]);

  // This browser's own ad was just knocked off: play the fall.
  useEffect(() => {
    if (offer) sfx.dethrone();
  }, [offer]);

  // Board bookings start and end on a schedule, not on an event: refetch at the
  // next change on either board.
  useEffect(() => {
    if (!state) return;
    const times = state.boards.flatMap((b) => [b.current?.endsAt, b.nextStartsAt]).filter(Boolean).map(Date.parse);
    const next = Math.min(...times) - (Date.now() + offsetMs);
    if (!Number.isFinite(next)) return;
    const id = setTimeout(refresh, Math.max(1000, next + 500));
    return () => clearTimeout(id);
  }, [state, offsetMs, refresh]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(id);
  }, [banner]);

  // --- Motion. Entrances are CSS animations (index.css), which can never
  // leave content hidden; GSAP is kept for the live takeover moments.
  const loaded = Boolean(state);

  // Sections slide up the first time they scroll into view. Done with a CSS
  // class (index.css .reveal-in) rather than GSAP from-tweens: a from-tween
  // that gets interrupted leaves its element invisible, a CSS reveal can't.
  useEffect(() => {
    if (!loaded || !page.current || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('reveal-in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    for (const el of page.current.querySelectorAll('.court-board, .how-step, .archive-teaser, .showcase-stat')) {
      // Stagger siblings of the same kind.
      el.style.setProperty('--i', [...el.parentElement.children].indexOf(el));
      io.observe(el);
    }
    return () => io.disconnect();
  }, [loaded]);

  // The takeover banner drops in like a stamp.
  useGSAP(
    () => {
      if (!banner || reducedMotion()) return;
      gsap.fromTo(bannerRef.current, { yPercent: -100, rotation: -1 }, { yPercent: 0, rotation: 0, duration: 0.45, ease: 'back.out(3)' });
    },
    { dependencies: [banner] },
  );

  if (!state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas p-4 text-center">
        <span className="flex items-end gap-2">
          <Shape kind="circle" color="red" className="h-8 w-8 animate-bounce border-2 border-ink" />
          <Shape kind="square" color="blue" className="h-8 w-8 animate-bounce border-2 border-ink [animation-delay:150ms]" />
          <Shape kind="triangle" color="yellow" className="h-8 w-9 animate-bounce [animation-delay:300ms]" />
        </span>
        <p className="label">{loadError ? `Can't reach the throne: ${loadError}` : 'Loading the throne'}</p>
      </div>
    );
  }

  const minNext = minNextBidCents(state.throne, now, state.rules);

  return (
    <div ref={page} className="min-h-screen overflow-x-clip bg-canvas">
      <Header />

      <div aria-live="polite" className="overflow-hidden">
        {banner && (
          <p ref={bannerRef} className="border-b-4 border-ink bg-bh-red px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-white sm:text-base">
            {banner}
          </p>
        )}
      </div>

      <RelegationBanner offer={offer} onDismiss={dismissOffer} />

      {state.paymentsMode === 'demo' && (
        <p className="border-b-2 border-ink bg-muted px-4 py-2 text-center text-xs font-bold uppercase tracking-wider">
          {t('hero.demo')}
        </p>
      )}

      {/* Billboard first: the live ad is the first thing on screen, phones
          included. Compact headline above it, bid panel alongside on desktop
          (below on phones), King of the Day band after. */}
      <section className="border-b-4 border-ink">
        {/* Headline row spans both columns, so the pinned billboard column below is short. */}
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <div className="mb-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <h1 className="display text-2xl sm:text-4xl">
              <span className="block overflow-hidden">
                <span className="hero-line intro-rise block">
                  {t('hero.one')} <span className="text-bh-red">{t('hero.outbid')}</span> {t('hero.king')}
                </span>
              </span>
            </h1>
            <LiveAudience online={viewers} visitsToday={audience.visitsToday} />
          </div>
          <p className="max-w-2xl text-sm font-medium leading-snug text-ink/75 sm:text-base">{t('hero.sub')}</p>
        </div>
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-12">
          {/* Desktop: the billboard column is sticky, so it stays on screen while
              the page scrolls through the bid form beside it. */}
          <div className="px-4 pb-8 pt-4 sm:px-6 lg:sticky lg:top-0 lg:col-span-8 lg:self-start lg:px-8 lg:pb-12 lg:pt-6">
            <Billboard throne={state.throne} now={now} />
            <BillboardStats stats={state.stats} />
            {state.throne && !state.throne.removed && <MapCard ad={state.throne} addonCents={state.rules.mapAddonCents} />}
          </div>

          <aside className="dot-grid relative overflow-clip border-t-4 border-ink bg-bh-blue px-4 py-10 sm:px-6 lg:col-span-4 lg:border-l-4 lg:border-t-4 lg:px-8 lg:py-12">
            <Shape kind="circle" color="yellow" className="hero-shape intro-pop absolute -right-16 -top-16 h-48 w-48 border-4 border-ink" />
            <Shape kind="square" color="red" className="hero-shape intro-pop absolute -bottom-12 -left-12 [animation-delay:120ms] h-32 w-32 rotate-45 border-4 border-ink" />
            <div className="bid-panel intro-slide relative">
              <BidForm minNextBidCents={minNext} rules={state.rules} onPriceChange={refresh} />
            </div>
          </aside>
        </div>
      </section>

      <CrownBand crown={state.crown} rules={state.rules} now={now} />

      <StatsStrip throne={state.throne} minNextBidCents={minNext} stats={state.stats} rules={state.rules} now={now} />

      <Court boards={state.boards} now={now} mapAddonCents={state.rules.mapAddonCents} />

      <Market boards={state.boards} now={now} mapAddonCents={state.rules.mapAddonCents} />

      <RecentlyDethroned legends={state.recentlyDethroned} now={now} />

      <Showcase stats={state.stats} topAdvertisers={state.topAdvertisers} />

      <section className="border-b-4 border-ink">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-3 lg:px-8 lg:py-24">
          <div className="lg:col-span-2">
            <Ticker throne={state.throne} legends={state.recentLegends} now={now} />
          </div>

          <a
            href="/kings"
            className="archive-teaser card group flex flex-col justify-between overflow-hidden bg-onyx p-6 text-white transition duration-200 ease-out hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bh-yellow lg:p-8"
          >
            {/* Geometric composition: a crowned "face" of stacked shapes. */}
            <div className="relative h-40" aria-hidden="true">
              <Shape kind="circle" color="red" className="absolute left-0 top-4 h-28 w-28 border-4 border-white transition duration-300 group-hover:scale-110" />
              <Shape kind="square" color="blue" className="absolute left-16 top-10 h-24 w-24 rotate-12 border-4 border-white" />
              <Shape kind="triangle" color="yellow" className="absolute left-28 top-0 h-16 w-20" />
            </div>
            <div>
              <p className="label text-bh-yellow">The archive</p>
              <h2 className="display mt-2 text-4xl">History of kings</h2>
              <p className="mt-3 font-medium leading-relaxed text-white/80">
                Every ad that ever held the throne, kept forever: what they paid, how long they lasted, who toppled them.
              </p>
              <span className="label mt-6 inline-flex items-center gap-2 text-bh-yellow">
                Enter the archive <ArrowRight className="h-4 w-4 transition duration-200 group-hover:translate-x-1" strokeWidth={3} />
              </span>
            </div>
          </a>
        </div>
      </section>

      <HowItWorks rules={state.rules} boards={state.boards} />
      <Footer />
    </div>
  );
}
