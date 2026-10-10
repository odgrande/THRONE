import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, Loader2, X } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { ownedAds, rememberOwnedAd } from '../lib/owned.js';
import { useModal } from '../lib/useModal.js';
import PayStep from './PayStep.jsx';
import Shape from './Shape.jsx';

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const when = (iso) => (Date.parse(iso) <= Date.now() + 60_000 ? 'right now' : dayFmt.format(new Date(iso)));

// Finds a relegation offer for any throne ad this browser owns. `dethronedBidId`
// lets a live takeover event check the exact ad immediately.
export function useRelegationOffer(dethronedBidId) {
  const [offer, setOffer] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const candidates = ownedAds().filter((a) => a.board === 'throne' && (!dethronedBidId || a.bidId === dethronedBidId));
    (async () => {
      for (const ad of candidates) {
        try {
          const o = await api.relegationOffer(ad.bidId, ad.token);
          if (o.eligible && !cancelled) return setOffer({ ...o, bidId: ad.bidId, token: ad.token });
        } catch {
          // Offers are a bonus; ignore lookup failures.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dethronedBidId]);
  return [offer, () => setOffer(null)];
}

function RelegateDialog({ offer, onClose }) {
  const dialog = useModal(onClose);
  const [checkout, setCheckout] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const started = useRef(false);

  // Create the relegation exactly once per dialog (StrictMode mounts twice in dev).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .relegate(offer.bidId, offer.token)
      .then((res) => {
        rememberOwnedAd(res);
        setCheckout(res);
      })
      .catch((err) => setError(err.message));
  }, [offer]);

  return (
    <dialog ref={dialog} aria-labelledby="relegate-title" className="m-auto w-[calc(100%-2rem)] max-w-md border-4 border-ink bg-paper p-0 text-ink shadow-hard-lg backdrop:bg-ink/60">
      <div className="flex items-center justify-between gap-3 border-b-4 border-ink bg-bh-blue px-5 py-3 text-white">
        <h2 id="relegate-title" className="font-black uppercase tracking-wider">Keep your ad up</h2>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close">
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>
      <div className="p-5">
        {error ? (
          <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 font-bold text-white">{error}</p>
        ) : result ? (
          <div className="space-y-4">
            <p className="border-2 border-ink bg-bh-yellow p-4 font-medium">
              {result.status === 'won'
                ? `Done. Your ad is on the ${offer.boardName} from ${when(result.startsAt)} for a full day.`
                : 'Payment received, still confirming. Your ad will appear in a moment.'}
            </p>
            <button type="button" onClick={() => dialog.current.close()} className="btn-outline w-full">Done</button>
          </div>
        ) : checkout ? (
          <PayStep
            checkout={checkout}
            intro={
              <>
                Same ad, no new upload. Pay <span className="font-black">{formatMoney(checkout.amountCents)}</span> for 1 day on the{' '}
                {offer.boardName}, starting {when(offer.startsAt)}.
              </>
            }
            onDone={setResult}
            onCancel={() => dialog.current.close()}
          />
        ) : (
          <p className="label flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> Preparing your offer
          </p>
        )}
      </div>
    </dialog>
  );
}

// Shown only in the browser that owns the dethroned ad.
export function RelegationBanner({ offer, onDismiss }) {
  const [open, setOpen] = useState(false);
  if (!offer) return null;
  return (
    <div className="relegation-banner border-b-4 border-ink bg-bh-blue text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <p className="flex items-center gap-3 font-bold">
          <ArrowDownRight className="h-6 w-6 shrink-0" strokeWidth={3} />
          <span>
            You were dethroned. Keep your ad visible: 1 day on the {offer.boardName} for{' '}
            <span className="bg-bh-yellow px-1.5 font-black text-ink">{formatMoney(offer.priceCents)}</span> (half price), starting {when(offer.startsAt)}.
          </span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(true)} className="btn-yellow btn-sm">Move my ad</button>
          <button type="button" onClick={onDismiss} className="btn-outline btn-sm" aria-label="Dismiss offer">
            <X className="h-4 w-4" strokeWidth={3} />
          </button>
        </div>
      </div>
      {open && (
        <RelegateDialog
          offer={offer}
          onClose={() => {
            setOpen(false);
            onDismiss();
          }}
        />
      )}
    </div>
  );
}

// Free bonus exposure: kings overthrown in the last 24 hours.
export function RecentlyDethroned({ legends, now }) {
  if (!legends?.length) return null;
  return (
    <section className="border-b-4 border-ink bg-paper" aria-labelledby="dethroned-title">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dethroned-title" className="text-2xl font-black uppercase tracking-tighter">Recently dethroned</h2>
          <p className="text-sm text-ink/60">Every fallen king gets 24 hours here, free.</p>
        </div>
        <ul className="mt-5 flex gap-4 overflow-x-auto pb-2">
          {legends.map((l, i) => (
            <li key={l.id} className="shrink-0">
              <a
                href={`/go/${l.bidId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="dethroned-chip flex w-64 items-center gap-3 border-2 border-ink bg-canvas p-3 shadow-hard-xs transition duration-200 hover:-translate-y-0.5 hover:bg-bh-cream"
              >
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-ink bg-bh-yellow">
                  {l.imageUrl ? (
                    <img src={l.imageUrl} alt="" className="h-full w-full object-cover grayscale" />
                  ) : (
                    <span className="flex h-full items-center justify-center font-black">{l.name[0]}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-black uppercase tracking-tight">{l.name}</span>
                  <span className="block truncate text-xs text-ink/60">
                    {l.tagline || 'Visit'} · {Math.max(1, Math.round((now - Date.parse(l.deposedAt)) / 3600_000))}h ago
                  </span>
                </span>
                <Shape kind={['circle', 'square', 'triangle'][i % 3]} color={['red', 'blue', 'yellow'][i % 3]} className="ml-auto h-3 w-3 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
