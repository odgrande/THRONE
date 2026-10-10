import { useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Loader2, X } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { rememberOwnedAd } from '../lib/owned.js';
import { useModal } from '../lib/useModal.js';
import AdFields, { EMPTY_AD } from './AdFields.jsx';
import PayStep from './PayStep.jsx';
import ReportButton from './ReportDialog.jsx';
import Shape from './Shape.jsx';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile.jsx';
import { LegalNote } from './BidForm.jsx';

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const when = (iso, now) => (Date.parse(iso) <= now + 60_000 ? 'now' : dayFmt.format(new Date(iso)));

// Each board has its own color identity.
const LOOK = {
  b2: { accent: 'bg-bh-blue text-white', shape: 'circle', shapeColor: 'yellow' },
  b3: { accent: 'bg-bh-yellow text-ink', shape: 'triangle', shapeColor: 'red' },
};

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

function MiniBoard({ board, now, onBook }) {
  const look = LOOK[board.id];
  const ad = board.current;
  const cheapest = Math.min(...Object.entries(board.prices).map(([d, p]) => p / Number(d)));

  return (
    <article className="court-board card flex flex-col">
      <div className={`flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-2 lg:border-b-4 ${look.accent}`}>
        <span className="label flex items-center gap-2">
          <Shape kind={look.shape} color={look.shapeColor} className="h-3 w-3" />
          {board.name}
        </span>
        <span className="label opacity-80">Guaranteed time</span>
      </div>

      <div className="relative aspect-video overflow-hidden border-b-2 border-ink bg-ink lg:border-b-4">
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
          {ad && !ad.removed && <ReportButton bidId={ad.id} adName={ad.name} className="text-ink/50" />}
        </div>
      </div>
    </article>
  );
}

const PACKAGE_COPY = { 1: '1 day', 3: '3 days', 7: '7 days' };

function BookingDialog({ board, now, onClose }) {
  const dialog = useModal(onClose);
  const [days, setDays] = useState(7);
  const [ad, setAd] = useState(EMPTY_AD);
  const [step, setStep] = useState('form'); // form | submitting | pay | done
  const [checkout, setCheckout] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  const waitingForBotCheck = Boolean(TURNSTILE_SITE_KEY) && !botToken;
  const perDay = (d) => board.prices[d] / d;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setStep('submitting');
    try {
      const res = await api.createBooking({ board: board.id, days, ...ad, turnstileToken: botToken });
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
      className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border-4 border-ink bg-white p-0 text-ink shadow-hard-lg backdrop:bg-ink/60"
    >
      <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b-4 border-ink px-5 py-3 ${LOOK[board.id].accent}`}>
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
                    className={`cursor-pointer border-2 border-ink p-3 text-center transition duration-200 ${days === d ? 'bg-bh-yellow shadow-hard-xs' : 'bg-white hover:bg-bh-cream'}`}
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

            <AdFields ad={ad} onChange={setAd} onError={setError} idPrefix={`book-${board.id}`} />

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
                `Book ${PACKAGE_COPY[days]} · ${formatMoney(board.prices[days])}`
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
export default function Court({ boards, now }) {
  const [booking, setBooking] = useState(null);
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
          {boards.map((b) => (
            <MiniBoard key={b.id} board={b} now={now} onBook={setBooking} />
          ))}
        </div>
      </div>
      {booking && <BookingDialog board={booking} now={now} onClose={() => setBooking(null)} />}
    </section>
  );
}
