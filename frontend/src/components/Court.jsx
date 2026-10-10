import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Loader2, Lock, MapPin, X } from 'lucide-react';
import MapCard from './MapCard.jsx';
import { accentFor } from './Billboard.jsx';
import { api, formatMoney } from '../lib/api.js';
import { rememberOwnedAd } from '../lib/owned.js';
import { useModal } from '../lib/useModal.js';
import { needsEmail } from '../lib/region.js';
import AdFields, { EMPTY_AD, EmailField } from './AdFields.jsx';
import PayStep from './PayStep.jsx';
import ReportButton from './ReportDialog.jsx';
import Shape from './Shape.jsx';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile.jsx';
import { LegalNote } from './BidForm.jsx';
import { t } from '../lib/i18n.js';

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const when = (iso, now) => (Date.parse(iso) <= now + 60_000 ? 'now' : dayFmt.format(new Date(iso)));

// Each board has its own color identity.
const LOOK = {
  b2: { accent: 'bg-bh-blue text-white', shape: 'circle', shapeColor: 'yellow' },
  b3: { accent: 'bg-bh-yellow text-ink', shape: 'triangle', shapeColor: 'red' },
};
// Market stalls cycle the three primaries.
const STALL_LOOKS = [
  { accent: 'bg-bh-red text-white', shape: 'circle', shapeColor: 'yellow' },
  { accent: 'bg-bh-blue text-white', shape: 'square', shapeColor: 'yellow' },
  { accent: 'bg-bh-yellow text-ink', shape: 'triangle', shapeColor: 'red' },
];
const lookOf = (id) => LOOK[id] ?? STALL_LOOKS[(Number(id.slice(1)) - 1) % STALL_LOOKS.length];

function BoardFace({ ad, look }) {
  if (ad.removed) {
    return (
      <div className="dot-grid-ink flex h-full items-center justify-center bg-muted p-4 text-center">
        <p className="display text-2xl text-ink/60">Ad removed</p>
      </div>
    );
  }
  if (ad.imageUrl) return <img src={ad.imageUrl} alt={ad.tagline || ad.name} className="h-full w-full object-contain" />;
  return (
    <div className={`flex h-full items-center justify-center p-5 text-center ${look.accent}`}>
      <p className="display text-2xl sm:text-3xl">{ad.tagline || ad.name}</p>
    </div>
  );
}

function MiniBoard({ board, now, onBook, onMap }) {
  const look = lookOf(board.id);
  const ad = board.current;
  const cheapest = Math.min(...Object.entries(board.prices).map(([d, p]) => p / Number(d)));

  return (
    <article className="court-board card flex flex-col">
      <div className={`flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-2 lg:border-b-4 ${look.accent}`}>
        <span className="label flex items-center gap-2">
          <Shape kind={look.shape} color={look.shapeColor} className="h-3 w-3" />
          {board.name}
        </span>
        <span className="label opacity-80">{ad && !ad.removed ? 'Paid ad · Guaranteed time' : 'Guaranteed time'}</span>
      </div>

      <div className="relative aspect-video overflow-hidden border-b-2 border-ink bg-onyx lg:border-b-4">
        {ad ? (
          ad.removed ? (
            <BoardFace ad={ad} look={look} />
          ) : (
            <a href={`/go/${ad.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${ad.name}'s ad`} className="group block h-full">
              <BoardFace ad={ad} look={look} />
              <span className="btn-yellow btn-sm absolute right-2 top-2 transition duration-200 group-hover:-translate-y-0.5">
                Visit <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </a>
          )
        ) : (
          <div className="dot-grid-ink flex h-full flex-col items-center justify-center gap-2 bg-canvas p-4 text-center">
            <Shape kind={look.shape} color={look.shapeColor} className="h-10 w-10 border-2 border-ink" />
            <p className="display text-2xl sm:text-3xl">Available now</p>
            <p className="text-sm font-medium text-ink/70">Your ad here in seconds</p>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {ad && (
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-black uppercase tracking-tight">{ad.name}</p>
            <p className="shrink-0 text-xs text-ink/60">until {dayFmt.format(new Date(ad.endsAt))}</p>
          </div>
        )}
        <p className="text-sm text-ink/70">
          <CalendarDays className="mr-1 inline h-4 w-4 align-text-bottom" strokeWidth={2.5} />
          Next free slot: <span className="font-bold text-ink">{when(board.nextFreeAt, now)}</span>
          {board.upcoming > 0 && <> · {board.upcoming} booked ahead</>}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => onBook(board)} className="btn-blue btn-sm">
            Book from {formatMoney(Math.ceil(cheapest))}/day
          </button>
          {ad && !ad.removed && (
            <span className="flex items-center gap-4">
              {/* Paid map: opens it. No map: a faded, locked pin. */}
              <button
                type="button"
                onClick={() => onMap(ad)}
                className={`label inline-flex items-center gap-1.5 ${ad.address ? 'hover:text-bh-red' : 'text-ink/30'}`}
                title={ad.address ? `Map: ${ad.address}` : 'This advertiser has no map'}
              >
                {ad.address ? <MapPin className="h-3.5 w-3.5" strokeWidth={3} /> : <Lock className="h-3.5 w-3.5" strokeWidth={3} />} Map
              </button>
              <ReportButton bidId={ad.id} adName={ad.name} className="text-ink/50" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

const PACKAGE_COPY = { 1: '1 day', 3: '3 days', 7: '7 days' };

function BookingDialog({ board, now, mapAddonCents: boardMapCents, onClose }) {
  // Market stalls are too small to show a map: no add-on there.
  const mapAddonCents = board.tier === 'market' ? 0 : boardMapCents;
  const dialog = useModal(onClose);
  const [days, setDays] = useState(7);
  const [ad, setAd] = useState(EMPTY_AD);
  const [step, setStep] = useState('form'); // form | submitting | pay | done
  const [checkout, setCheckout] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  const waitingForBotCheck = Boolean(TURNSTILE_SITE_KEY) && !botToken;
  const perDay = (d) => board.prices[d] / d;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setStep('submitting');
    try {
      const res = await api.createBooking({ board: board.id, days, ...ad, turnstileToken: botToken, ...(needsEmail() ? { email } : {}) });
      rememberOwnedAd(res);
      setCheckout(res);
      setStep('pay');
    } catch (err) {
      setError(err.message);
      setStep('form');
    } finally {
      turnstileRef.current?.reset();
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="booking-title"
      className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border-4 border-ink bg-paper p-0 text-ink shadow-hard-lg backdrop:bg-ink/60"
    >
      <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b-4 border-ink px-5 py-3 ${lookOf(board.id).accent}`}>
        <h2 id="booking-title" className="font-black uppercase tracking-wider">Book the {board.name}</h2>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close" className="hover:opacity-80">
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>

      <div className="p-5">
        {step === 'done' ? (
          <div className="space-y-4">
            {result.status === 'won' ? (
              <div className="border-2 border-ink bg-bh-yellow p-4">
                <p className="text-xl font-black uppercase tracking-tight">You're booked</p>
                <p className="mt-1 font-medium leading-relaxed">
                  Your ad runs on the {board.name} from <span className="font-bold">{when(result.startsAt, Date.now())}</span> to{' '}
                  <span className="font-bold">{dayFmt.format(new Date(result.endsAt))}</span>. Guaranteed: nobody can knock it off.
                </p>
              </div>
            ) : (
              <p className="border-2 border-ink bg-muted p-4 font-medium">Payment received, still confirming. Your booking will appear in a moment.</p>
            )}
            <button type="button" onClick={() => dialog.current.close()} className="btn-outline w-full">
              Done
            </button>
          </div>
        ) : step === 'pay' ? (
          <PayStep
            checkout={checkout}
            intro={
              <>
                Your ad passed the safety check. Pay <span className="font-black">{formatMoney(checkout.amountCents)}</span> for{' '}
                {PACKAGE_COPY[days]} on the {board.name}.
              </>
            }
            onDone={(r) => {
              setResult(r);
              setStep('done');
            }}
            onCancel={() => setStep('form')}
          />
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <fieldset>
              <legend className="label mb-2">How long?</legend>
              <div className="grid grid-cols-3 gap-2">
                {[1, 3, 7].map((d) => (
                  <label
                    key={d}
                    className={`cursor-pointer border-2 border-ink p-3 text-center transition duration-200 ${days === d ? 'bg-bh-yellow shadow-hard-xs' : 'bg-paper hover:bg-bh-cream'}`}
                  >
                    <input type="radio" name="days" value={d} checked={days === d} onChange={() => setDays(d)} className="sr-only" />
                    <span className="block text-sm font-bold uppercase">{PACKAGE_COPY[d]}</span>
                    <span className="block text-xl font-black tabular-nums">{formatMoney(board.prices[d])}</span>
                    <span className="block text-xs text-ink/60">
                      {d === 1 ? 'per day' : `${Math.round((1 - perDay(d) / perDay(1)) * 100)}% off`}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm text-ink/70">
                Starts <span className="font-bold text-ink">{when(board.nextFreeAt, now)}</span>, the next free slot (set when you pay).
              </p>
            </fieldset>

            <AdFields ad={ad} onChange={setAd} onError={setError} idPrefix={`book-${board.id}`} mapAddonCents={mapAddonCents} />
            {needsEmail() && <EmailField value={email} onChange={setEmail} idPrefix={`book-${board.id}`} />}

            {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
            <Turnstile ref={turnstileRef} onToken={setBotToken} />

            <button type="submit" disabled={step === 'submitting' || waitingForBotCheck} className="btn-blue w-full text-lg">
              {step === 'submitting' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> Checking your ad
                </>
              ) : waitingForBotCheck ? (
                'Checking you are human…'
              ) : (
                `Book ${PACKAGE_COPY[days]} · ${formatMoney(board.prices[days] + (ad.withMap ? mapAddonCents : 0))}`
              )}
            </button>
            <LegalNote />
          </form>
        )}
      </div>
    </dialog>
  );
}

// The Court: two smaller boards sold as fixed-price, guaranteed-time bookings.
function MapDialog({ ad, addonCents, onClose }) {
  const dialog = useModal(onClose);
  return (
    <dialog ref={dialog} aria-label={`Map for ${ad.name}`} className="m-auto w-[calc(100%-2rem)] max-w-2xl border-4 border-ink bg-paper p-0 shadow-hard-lg backdrop:bg-ink/60">
      <div className="flex items-center justify-between border-b-4 border-ink bg-onyx px-5 py-3 text-white">
        <span className="font-black uppercase tracking-wider">{ad.name}</span>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close">
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>
      <div className="p-4 [&>div]:mt-0">
        <MapCard ad={ad} addonCents={addonCents} />
      </div>
    </dialog>
  );
}

export default function Court({ boards, now, mapAddonCents }) {
  const [booking, setBooking] = useState(null);
  const [mapFor, setMapFor] = useState(null);
  return (
    <section className="border-b-4 border-ink bg-canvas" aria-labelledby="court-title">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label text-bh-red">The Court</p>
            <h2 id="court-title" className="display mt-2 text-4xl sm:text-6xl">
              No war. Just days.
            </h2>
          </div>
          <p className="max-w-md font-medium leading-relaxed text-ink/80">
            Book a smaller board for 1, 3 or 7 days at a fixed price. Guaranteed: nobody can knock you off.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
          {boards.filter((b) => b.tier !== 'market').map((b) => (
            <MiniBoard key={b.id} board={b} now={now} onBook={setBooking} onMap={setMapFor} />
          ))}
        </div>
      </div>
      {booking && <BookingDialog board={booking} now={now} mapAddonCents={mapAddonCents} onClose={() => setBooking(null)} />}
      {mapFor && <MapDialog ad={mapFor} addonCents={mapAddonCents} onClose={() => setMapFor(null)} />}
    </section>
  );
}

// One stall on the Market wall: a small square ad with the same markings as
// the billboard (paid-ad label, report, safety-checked visit link, frame
// colour), or an open slot to book.
function Stall({ board, index, onBook }) {
  const look = lookOf(board.id);
  const ad = board.current;
  const dayPrice = formatMoney(board.prices[1]);
  const style = { '--i': index };
  if (!ad) {
    return (
      <button
        type="button"
        onClick={() => onBook(board)}
        style={style}
        className="court-stall group flex aspect-square flex-col items-center justify-center gap-1 border-2 border-dashed border-ink bg-paper p-2 text-center transition duration-200 hover:-translate-y-0.5 hover:bg-bh-cream"
        aria-label={`${t('market.free')}: ${board.name}, ${dayPrice}/day`}
      >
        <Shape kind={look.shape} color={look.shapeColor} className="h-6 w-6 border-2 border-ink transition duration-200 group-hover:scale-110" />
        <span className="text-xs font-black uppercase leading-tight">{t('market.free')}</span>
        <span className="text-[11px] font-bold tabular-nums text-ink/70">{dayPrice}/day</span>
      </button>
    );
  }
  const accent = accentFor(ad.id);
  return (
    <article style={style} className="court-stall flex aspect-square flex-col border-2 border-ink bg-paper shadow-hard-xs">
      <div className={`flex items-center justify-between gap-1 border-b-2 border-ink px-1.5 py-0.5 ${accent.bar}`}>
        <span className="truncate text-[9px] font-black uppercase tracking-wider opacity-90">{ad.removed ? 'Removed' : 'Paid ad'}</span>
        {!ad.removed && <ReportButton bidId={ad.id} adName={ad.name} compact className="shrink-0 opacity-80 hover:opacity-100" />}
      </div>
      {ad.removed ? (
        <div className="flex flex-1 items-center justify-center bg-muted p-2 text-center text-xs font-bold text-ink/60">Ad removed</div>
      ) : (
        <a
          href={`/go/${ad.id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${ad.name}'s ad (opens a safety check first)`}
          className="group relative block min-h-0 flex-1 overflow-hidden bg-onyx"
        >
          {ad.imageUrl ? (
            <img src={ad.imageUrl} alt={ad.tagline || ad.name} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
          ) : (
            <span className={`flex h-full items-center justify-center p-2 text-center text-xs font-black uppercase leading-tight sm:text-sm ${look.accent}`}>
              {ad.tagline || ad.name}
            </span>
          )}
          <span className="btn-yellow absolute right-1 top-1 px-1.5 py-0.5 text-[9px] opacity-0 transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            Visit <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        </a>
      )}
      {/* The ad's frame colour, like the billboard. */}
      <div aria-hidden="true" className={`h-[4px] border-t-[4px] ${accent.frame}`} />
      <div className="flex items-baseline justify-between gap-1 border-t-2 border-ink px-1.5 py-0.5">
        <span className="truncate text-[11px] font-black uppercase">{ad.name}</span>
        <span className="shrink-0 text-[9px] text-ink/60">to {new Date(ad.endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      </div>
    </article>
  );
}

// The Market: a wall of small, cheap stalls for advertisers on a tight budget.
// The Million Dollar Homepage idea (2005: a million pixels at $1 each), made
// live: every stall is a fixed-price, guaranteed-time booking.
export function Market({ boards, now, mapAddonCents }) {
  const [booking, setBooking] = useState(null);
  // Stalls pop in (CSS) the first time the wall scrolls into view. Plain CSS:
  // if the animation never runs, the stalls are simply shown.
  const wall = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!wall.current || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(wall.current);
    return () => io.disconnect();
  }, []);
  const stalls = boards.filter((b) => b.tier === 'market');
  if (!stalls.length) return null;
  const dayPrice = formatMoney(Math.min(...stalls.map((b) => b.prices[1])));
  // "Book any free stall": the one that frees up first.
  const soonest = [...stalls].sort((a, b) => Date.parse(a.nextFreeAt) - Date.parse(b.nextFreeAt))[0];
  return (
    <section className="border-b-4 border-ink bg-bh-cream" aria-labelledby="market-title">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label text-bh-blue">{t('market.kicker')}</p>
            <h2 id="market-title" className="display mt-2 text-4xl sm:text-6xl">
              {t('market.title')}
            </h2>
          </div>
          <div className="max-w-md space-y-3">
            <p className="font-medium leading-relaxed text-ink/80">{t('market.body', { price: dayPrice })}</p>
            <button type="button" onClick={() => setBooking(soonest)} className="btn-red btn-sm">
              {t('market.book', { price: dayPrice })}
            </button>
          </div>
        </div>
        <div ref={wall} className={`stall-wall mt-10 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 ${seen ? 'is-in' : ''}`}>
          {stalls.map((b, i) => (
            <Stall key={b.id} board={b} index={i} onBook={setBooking} />
          ))}
        </div>
        <p className="mt-4 text-sm font-medium text-ink/70">{t('market.howto')}</p>
      </div>
      {booking && <BookingDialog board={booking} now={now} mapAddonCents={mapAddonCents} onClose={() => setBooking(null)} />}
    </section>
  );
}
