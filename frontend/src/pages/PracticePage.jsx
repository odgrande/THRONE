import { useEffect, useState } from 'react';
import { Bot, RotateCcw } from 'lucide-react';
import { amountToText, api, formatDuration, formatMoney, textToCents } from '../lib/api.js';
import { adoptRegion, regionInfo } from '../lib/region.js';
import { minNextBidCents } from '../lib/rules.js';
import { BOT_SPEEDS, usePracticeSim } from '../lib/practiceSim.js';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Billboard, { BillboardStats } from '../components/Billboard.jsx';
import { ThroneRules } from '../components/BidForm.jsx';
import { sfx } from '../lib/sound.js';
import StatsStrip from '../components/StatsStrip.jsx';
import Shape, { CornerMark } from '../components/Shape.jsx';

// Used if the API can't be reached: practice still works, with default rules.
const DEFAULT_RULES = {
  startingPriceCents: 500,
  minIncrementCents: 200,
  minRaisePct: 10,
  shieldBaseSeconds: 60,
  shieldStepCents: 100,
  shieldSecondsPerStep: 30,
  sliderStepCents: 50,
  bumpCents: [500, 2000],
  shieldMaxSeconds: 1800,
  shieldPremiumPct: 25,
  throneTermSeconds: 7 * 86400,
  crownOvertimeWindowSeconds: 60,
  crownExtensionSeconds: 12,
  relegationDiscountPct: 50,
};

const SPEED_LABELS = { off: 'Off', slow: 'Slow', fast: 'Fast' };

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function PracticePage() {
  const [rules, setRules] = useState(DEFAULT_RULES);
  useEffect(() => {
    api.getState().then(
      (s) => {
        adoptRegion(s.region);
        setRules(s.rules);
      },
      () => {},
    );
  }, []);
  return <Arena key={JSON.stringify(rules)} rules={rules} />;
}

function Arena({ rules }) {
  const [speed, setSpeed] = useState('slow');
  const { sim, playerBid, reset } = usePracticeSim(rules, speed);
  const now = useNow();
  const minNext = minNextBidCents(sim.throne, now, rules);

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [amountText, setAmountText] = useState(amountToText(minNext));
  const [error, setError] = useState(null);
  const amountCents = textToCents(amountText);
  const sliderStep = rules.sliderStepCents ?? 50;
  const sliderMax = Math.ceil(Math.max(minNext * 4, minNext + rules.startingPriceCents * 20) / sliderStep) * sliderStep;
  const { symbol, currency } = regionInfo();

  // Same sounds as the real throne (no-ops while sound is off).
  const lastKing = sim.throne?.id;
  useEffect(() => {
    if (!lastKing) return;
    if (sim.log[0]?.youLost) sfx.dethrone();
    sfx.takeover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKing]);

  // Keep the amount at or above the live minimum as rivals bid.
  useEffect(() => {
    setAmountText((cur) => (textToCents(cur) < minNext ? amountToText(minNext) : cur));
  }, [minNext]);

  const submit = (e) => {
    e.preventDefault();
    setError(playerBid({ name: name.trim(), tagline: tagline.trim(), amountCents }));
  };

  return (
    <div className="min-h-screen bg-canvas">
      <Header />

      {/* Unmissable: nothing on this page is real. */}
      <p className="border-b-4 border-ink bg-bh-yellow px-4 py-3 text-center text-sm font-black uppercase tracking-wider">
        Practice mode · play money and computer rivals · nothing here is real, public or saved
      </p>

      <section className="border-b-4 border-ink">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-12">
          <div className="px-4 py-10 sm:px-6 sm:py-12 lg:col-span-8 lg:px-8 lg:py-16">
            <p className="label flex items-center gap-2">
              <Bot className="h-4 w-4" strokeWidth={2.5} /> Training ground
            </p>
            <h1 className="display mt-4 text-5xl sm:text-7xl lg:text-8xl">
              Practice
              <br />
              <span className="text-bh-blue">arena.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg font-medium leading-relaxed">
              Learn the shield and the minimum raise against computer rivals before you spend real money.
            </p>
            <div className="mt-10">
              <Billboard throne={sim.throne} now={now} practice />
              <BillboardStats
                stats={{
                  volumeCents: sim.stats.volumeCents,
                  takeovers: sim.stats.takeovers,
                  recordCents: Math.max(0, ...sim.log.map((e) => e.amountCents)),
                }}
              />
            </div>
          </div>

          <aside className="dot-grid relative overflow-hidden border-t-4 border-ink bg-bh-blue px-4 py-10 sm:px-6 lg:col-span-4 lg:border-l-4 lg:border-t-0 lg:px-8 lg:py-16">
            <Shape kind="circle" color="yellow" className="absolute -right-16 -top-16 h-48 w-48 border-4 border-ink" />
            <div className="card relative p-5 sm:p-6 lg:sticky lg:top-8">
              <CornerMark index={1} />
              <p className="label text-bh-blue">Play money</p>
              <h2 className="display mb-5 mt-1 text-3xl sm:text-4xl">Take the throne</h2>

              <div className="mb-5 grid grid-cols-2 gap-1 border-2 border-ink bg-ink">
                <div className="bg-bh-yellow p-3">
                  <p className="label text-ink/70">Play money</p>
                  <p className="text-xl font-black tabular-nums">{formatMoney(sim.playMoneyCents)}</p>
                </div>
                <div className="bg-paper p-3">
                  <p className="label text-ink/70">Times you took it</p>
                  <p className="text-xl font-black tabular-nums">{sim.timesCrowned}</p>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <label className="block">
                  <span className="label mb-1.5 block">Name</span>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="You" />
                </label>
                <label className="block">
                  <span className="label mb-1.5 block">Tagline</span>
                  <input className="field" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={100} />
                </label>
                <div>
                  <span className="label mb-1.5 flex justify-between">
                    Your bid
                    {amountCents < minNext ? (
                      <span className="text-bh-red" role="status">Must be at least {formatMoney(minNext)}</span>
                    ) : (
                      <span className="text-ink/50">Min {formatMoney(minNext)}</span>
                    )}
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-black">{symbol}</span>
                    <input
                      className="field pl-7 text-lg font-black tabular-nums"
                      type="number"
                      inputMode="decimal"
                      aria-label={`Practice bid amount in ${currency === 'NGN' ? 'naira' : 'dollars'}`}
                      step={currency === 'NGN' ? '1' : '0.01'}
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                    />
                  </div>
                  <input
                    type="range"
                    aria-label="Practice bid slider"
                    min={minNext}
                    max={sliderMax}
                    step={sliderStep}
                    value={Math.min(Math.max(amountCents, minNext), sliderMax)}
                    onChange={(e) => setAmountText(amountToText(Number(e.target.value)))}
                    className="mt-3 h-3 w-full cursor-pointer appearance-none border-2 border-ink bg-paper accent-bh-red [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-bh-red [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-bh-red"
                  />
                </div>
                {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
                <button type="submit" disabled={amountCents < minNext} className="btn-red w-full text-lg">
                  Take it · {formatMoney(amountCents)} (practice)
                </button>
                <ThroneRules rules={rules} />
              </form>

              <div className="mt-6 border-t-2 border-ink pt-5">
                <p className="label mb-2">Rival bots</p>
                <div className="flex gap-2" role="group" aria-label="Rival bot speed">
                  {Object.keys(BOT_SPEEDS).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSpeed(key)}
                      aria-pressed={speed === key}
                      className={`${speed === key ? 'btn-yellow' : 'btn-outline'} btn-sm flex-1 rounded-full`}
                    >
                      {SPEED_LABELS[key]}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={reset} className="label mt-4 inline-flex items-center gap-1.5 hover:text-bh-red">
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={3} /> Reset practice
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <StatsStrip throne={sim.throne} minNextBidCents={minNext} stats={sim.stats} rules={rules} now={now} />

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="card">
          <h2 className="border-b-2 border-ink px-4 py-4 text-2xl font-black uppercase tracking-tighter sm:text-3xl lg:border-b-4 lg:px-6">
            Practice log
          </h2>
          {sim.log.length === 0 ? (
            <p className="px-6 py-10 text-center font-medium text-ink/60">Make a bid, or wait for a rival to make the first move.</p>
          ) : (
            <ul className="divide-y-2 divide-ink">
              {sim.log.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 lg:px-6">
                  <span className="flex min-w-0 items-center gap-3">
                    <Shape kind={entry.you ? 'circle' : 'square'} color={entry.you ? 'red' : 'blue'} className="h-3.5 w-3.5" />
                    <span className="truncate font-bold uppercase tracking-tight">
                      {entry.name}
                      {!entry.you && <span className="label ml-2 text-ink/50">bot</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-4 text-sm">
                    {entry.previousName && <span className="text-ink/70">took it from {entry.previousName}</span>}
                    {entry.youLost && <span className="font-bold text-bh-red">you were dethroned</span>}
                    <span className="text-ink/50">{formatDuration(now - Date.parse(entry.startedAt))} ago</span>
                    <span className="text-lg font-black tabular-nums">{formatMoney(entry.amountCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-6 text-center">
          <a href="/" className="btn-blue">Ready? Go to the real throne</a>
        </p>
      </section>

      <Footer />
    </div>
  );
}
