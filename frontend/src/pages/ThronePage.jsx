import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { minNextBidCents } from '../lib/rules.js';
import { gsap, reducedMotion, ScrollTrigger, useGSAP } from '../lib/motion.js';
import { announceCrowned, announceTakeover, sfx } from '../lib/sound.js';
import CrownBand from '../components/CrownBand.jsx';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Shape from '../components/Shape.jsx';
import Billboard, { BillboardStats } from '../components/Billboard.jsx';
import BidForm from '../components/BidForm.jsx';
import StatsStrip from '../components/StatsStrip.jsx';
import Court from '../components/Court.jsx';
import MapCard from '../components/MapCard.jsx';
import Showcase from '../components/Showcase.jsx';
import Ticker from '../components/Ticker.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
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
  const [banner, setBanner] = useState(null);
  const [dethronedBidId, setDethronedBidId] = useState(null);
  const [offer, dismissOffer] = useRelegationOffer(dethronedBidId);
  const page = useRef(null);
  const bannerRef = useRef(null);
  const now = useServerNow(offsetMs);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getState();
      setOffsetMs(Date.parse(next.serverTime) - Date.now());
      setState(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const events = new EventSource(api.eventsUrl());
    events.addEventListener('takeover', (e) => {
      const data = JSON.parse(e.data);
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
      const data = JSON.parse(e.data);
      refresh();
      setBanner(`👑 ${data.name} is King of the Day!`);
      announceCrowned(data.name);
    });
    events.addEventListener('retired', (e) => {
      refresh();
      sfx.retired();
      setBanner(`${JSON.parse(e.data).name} served the full term and retires. The throne is open!`);
    });
    events.addEventListener('booked', () => {
      refresh();
      sfx.booked();
    });
    // A takedown or a restore: refetch so every screen updates.
    events.addEventListener('removed', refresh);
    events.addEventListener('viewers', (e) => setViewers(JSON.parse(e.data).count));
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

  // --- Motion (GSAP). Reduced-motion visitors get the content without it. ---
  const loaded = Boolean(state);
  useGSAP(
    () => {
      if (!loaded || reducedMotion()) return;
      const intro = gsap.timeline();
      intro
        .from('.hero-line', { yPercent: 110, opacity: 0, stagger: 0.12, duration: 0.7, ease: 'power4.out' })
        .from('.hero-shape', { scale: 0, rotation: -90, stagger: 0.08, ease: 'back.out(2)' }, '-=0.4')
        .from('.bid-panel', { x: 60, opacity: 0, duration: 0.6 }, '-=0.5');
      // Sections slide up as they scroll into view (once). Elements stay
      // visible until their trigger fires, so a missed trigger can never hide
      // content.
      ScrollTrigger.batch('.court-board, .how-step, .archive-teaser, .showcase-stat', {
        start: 'top 92%',
        once: true,
        onEnter: (els) => gsap.from(els, { y: 50, opacity: 0, stagger: 0.12 }),
      });
    },
    { scope: page, dependencies: [loaded] },
  );

  // Live data changes the page height; re-measure scroll positions after it settles.
  useEffect(() => {
    if (!state) return;
    const id = setTimeout(() => ScrollTrigger.refresh(), 300);
    return () => clearTimeout(id);
  }, [state]);

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
    <div ref={page} className="min-h-screen overflow-x-hidden bg-canvas">
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
          Test site · payments are simulated · open two windows to watch the live sync
        </p>
      )}

      <CrownBand crown={state.crown} rules={state.rules} now={now} />

      {/* Hero: poster headline + billboard on the left, blue bid panel on the right. */}
      <section className="border-b-4 border-ink">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-12">
          <div className="px-4 py-10 sm:px-6 sm:py-12 lg:col-span-8 lg:px-8 lg:py-16">
            <p className="label flex items-center gap-2">
              <Shape kind="circle" color="red" className="h-2.5 w-2.5 animate-pulse" />
              Live · {viewers} watching
            </p>
            <h1 className="display mt-4 text-5xl sm:text-7xl lg:text-8xl">
              <span className="block overflow-hidden pb-1">
                <span className="hero-line block">One billboard.</span>
              </span>
              <span className="block overflow-hidden pb-1">
                <span className="hero-line block">
                  <span className="text-bh-red">Outbid</span> the king.
                </span>
              </span>
            </h1>
            <div className="mt-10">
              <Billboard throne={state.throne} now={now} />
              <BillboardStats stats={state.stats} />
              {state.throne && !state.throne.removed && <MapCard ad={state.throne} addonCents={state.rules.mapAddonCents} />}
            </div>
          </div>

          <aside className="dot-grid relative overflow-hidden border-t-4 border-ink bg-bh-blue px-4 py-10 sm:px-6 lg:col-span-4 lg:border-l-4 lg:border-t-0 lg:px-8 lg:py-16">
            <Shape kind="circle" color="yellow" className="hero-shape absolute -right-16 -top-16 h-48 w-48 border-4 border-ink" />
            <Shape kind="square" color="red" className="hero-shape absolute -bottom-12 -left-12 h-32 w-32 rotate-45 border-4 border-ink" />
            <div className="bid-panel relative lg:sticky lg:top-8">
              <BidForm minNextBidCents={minNext} rules={state.rules} onPriceChange={refresh} />
            </div>
          </aside>
        </div>
      </section>

      <StatsStrip throne={state.throne} minNextBidCents={minNext} stats={state.stats} rules={state.rules} now={now} />

      <Court boards={state.boards} now={now} mapAddonCents={state.rules.mapAddonCents} />

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
