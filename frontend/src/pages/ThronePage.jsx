import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { minNextBidCents } from '../lib/rules.js';
import { getWalletToken } from '../lib/wallet.js';
import { announceCrowned, announceTakeover, unlockAudio } from '../lib/sound.js';
import CrownBand from '../components/CrownBand.jsx';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Shape from '../components/Shape.jsx';
import Billboard from '../components/Billboard.jsx';
import BidForm from '../components/BidForm.jsx';
import StatsStrip from '../components/StatsStrip.jsx';
import Ticker from '../components/Ticker.jsx';
import HowItWorks from '../components/HowItWorks.jsx';

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
  const [soundOn, setSoundOn] = useState(false);
  const [banner, setBanner] = useState(null);
  const [wallet, setWallet] = useState(null);
  const soundRef = useRef(false);
  const now = useServerNow(offsetMs);

  const refreshWallet = useCallback(async () => {
    try {
      setWallet(await api.getWallet(getWalletToken()));
    } catch {
      // Non-critical: the form just won't offer credits.
    }
  }, []);

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
    refreshWallet();
    const events = new EventSource(api.eventsUrl());
    events.addEventListener('takeover', (e) => {
      const data = JSON.parse(e.data);
      refresh();
      // If this browser was the king that just fell, its dividend has landed.
      refreshWallet();
      const price = formatMoney(data.throne.amountCents);
      setBanner(
        data.previousName
          ? `${data.throne.name} knocked ${data.previousName} off the throne for ${price}!`
          : `${data.throne.name} claimed the throne for ${price}!`,
      );
      if (soundRef.current) announceTakeover(data, price);
    });
    events.addEventListener('crowned', (e) => {
      const data = JSON.parse(e.data);
      refresh();
      setBanner(`👑 ${data.name} is King of the Day!`);
      if (soundRef.current) announceCrowned(data.name);
    });
    events.addEventListener('viewers', (e) => setViewers(JSON.parse(e.data).count));
    // Resync after a dropped connection, in case takeovers were missed.
    events.addEventListener('open', refresh);
    return () => events.close();
  }, [refresh, refreshWallet]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(id);
  }, [banner]);

  const toggleSound = () => {
    if (!soundOn) unlockAudio();
    soundRef.current = !soundOn;
    setSoundOn(!soundOn);
  };

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
    <div className="min-h-screen bg-canvas">
      <Header>
        {wallet?.balanceCents > 0 && (
          <span className="flex items-center gap-2 border-2 border-ink bg-bh-yellow px-3 py-1.5 text-xs font-bold uppercase tracking-wider shadow-hard-xs">
            <span className="hidden sm:inline">Credits</span>
            <span className="font-black tabular-nums">{formatMoney(wallet.balanceCents)}</span>
          </span>
        )}
        <button
          onClick={toggleSound}
          aria-pressed={soundOn}
          className={`${soundOn ? 'btn-yellow' : 'btn-outline'} btn-sm`}
        >
          {soundOn ? <Volume2 className="h-4 w-4" strokeWidth={3} /> : <VolumeX className="h-4 w-4" strokeWidth={3} />}
          <span className="hidden sm:inline">{soundOn ? 'Sound on' : 'Sound off'}</span>
        </button>
      </Header>

      <div aria-live="polite">
        {banner && (
          <p className="animate-slam border-b-4 border-ink bg-bh-red px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-white sm:text-base">
            {banner}
          </p>
        )}
      </div>

      {state.paymentsMode === 'demo' && (
        <p className="border-b-2 border-ink bg-muted px-4 py-2 text-center text-xs font-bold uppercase tracking-wider">
          Demo mode · payments are simulated · open two windows to watch the live sync
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
              One billboard.
              <br />
              <span className="text-bh-red">Outbid</span> the king.
            </h1>
            <div className="mt-10">
              <Billboard throne={state.throne} />
            </div>
          </div>

          <aside className="dot-grid relative overflow-hidden border-t-4 border-ink bg-bh-blue px-4 py-10 sm:px-6 lg:col-span-4 lg:border-l-4 lg:border-t-0 lg:px-8 lg:py-16">
            <Shape kind="circle" color="yellow" className="absolute -right-16 -top-16 h-48 w-48 border-4 border-ink" />
            <Shape kind="square" color="red" className="absolute -bottom-12 -left-12 h-32 w-32 rotate-45 border-4 border-ink" />
            <div className="relative lg:sticky lg:top-8">
              <BidForm
                minNextBidCents={minNext}
                paymentsMode={state.paymentsMode}
                rules={state.rules}
                wallet={wallet}
                onPriceChange={refresh}
                onWalletChange={refreshWallet}
              />
            </div>
          </aside>
        </div>
      </section>

      <StatsStrip throne={state.throne} minNextBidCents={minNext} creatorFundCents={state.creatorFundCents} stats={state.stats} rules={state.rules} now={now} />

      <section className="border-b-4 border-ink">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-3 lg:px-8 lg:py-24">
          <div className="lg:col-span-2">
            <Ticker throne={state.throne} legends={state.recentLegends} now={now} />
          </div>

          <a
            href="/kings"
            className="card group flex flex-col justify-between overflow-hidden bg-ink p-6 text-white transition duration-200 ease-out hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bh-yellow lg:p-8"
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

      <HowItWorks rules={state.rules} />
      <Footer />
    </div>
  );
}
