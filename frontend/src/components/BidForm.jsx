import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { splitPayment } from '../lib/rules.js';
import { getWalletToken, setWalletToken } from '../lib/wallet.js';
import { CornerMark } from './Shape.jsx';
import CreditsPanel from './CreditsPanel.jsx';
import StripeCheckout from './StripeCheckout.jsx';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile.jsx';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// Polls until the webhook has settled the bid (usually under a second).
async function waitForSettlement(bidId) {
  for (let i = 0; i < 30; i++) {
    const { status } = await api.bidStatus(bidId);
    if (status !== 'pending') return status;
    await new Promise((r) => setTimeout(r, 500));
  }
  return 'pending';
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label mb-1.5 flex justify-between gap-2">
        {label}
        {hint && <span className="text-ink/50">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function BidForm({ minNextBidCents, paymentsMode, rules, wallet, onPriceChange, onWalletChange }) {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [image, setImage] = useState(null);
  const [amountText, setAmountText] = useState((minNextBidCents / 100).toFixed(2));
  const amountCents = Math.round(Number(amountText) * 100) || 0;
  const setAmountCents = (cents) => setAmountText((cents / 100).toFixed(2));
  const [step, setStep] = useState('form'); // form | submitting | pay | settling | result
  const [checkout, setCheckout] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [useCredits, setUseCredits] = useState(true);
  const balanceCents = wallet?.balanceCents ?? 0;
  const split = splitPayment(amountCents, useCredits ? balanceCents : 0);
  // Slider spans the minimum to 4x it (at least +$100), in whole dollars.
  const sliderMax = Math.ceil(Math.max(minNextBidCents * 4, minNextBidCents + 10000) / 100) * 100;
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  const waitingForBotCheck = Boolean(TURNSTILE_SITE_KEY) && !botToken;

  // When someone else bids, never leave the form below the new minimum.
  useEffect(() => {
    setAmountText((cur) => {
      const cents = Math.round(Number(cur) * 100) || 0;
      return cents < minNextBidCents ? (minNextBidCents / 100).toFixed(2) : cur;
    });
  }, [minNextBidCents]);

  const takeFile = async (file) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError('Use a PNG, JPEG, GIF or WebP image.');
    if (file.size > MAX_IMAGE_BYTES) return setError('Image must be 2 MB or smaller.');
    setImage(await readAsDataUrl(file));
  };

  // Paste a screenshot or meme straight from the clipboard.
  const onPaste = (e) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      takeFile(file);
    }
  };

  const reset = () => {
    setStep('form');
    setCheckout(null);
    setMessage(null);
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setStep('submitting');
    try {
      const res = await api.createBid({
        name,
        tagline,
        targetUrl,
        image,
        amountCents,
        walletToken: getWalletToken(),
        useCredits: useCredits && balanceCents > 0,
        turnstileToken: botToken,
      });
      if (res.walletToken) setWalletToken(res.walletToken);
      // Paid entirely with credits: the server settled it already.
      if (res.status) return finish(res.status);
      setCheckout(res);
      setStep('pay');
    } catch (err) {
      if (err.body?.minNextBidCents) {
        setAmountCents(err.body.minNextBidCents);
        onPriceChange();
      }
      setError(err.message);
      setStep('form');
    } finally {
      // Turnstile tokens are single-use, so every attempt needs a fresh one.
      turnstileRef.current?.reset();
    }
  };

  const finish = (status) => {
    onWalletChange();
    if (status === 'won') {
      setMessage({ ok: true, text: 'The crown is yours. Share the link and dare them to beat you.' });
      setName('');
      setTagline('');
      setTargetUrl('');
      setImage(null);
    } else if (status === 'refunded' || status === 'outbid' || status === 'void') {
      setMessage({
        ok: false,
        text: 'Someone beat you to it at that price. Any card payment was refunded in full and your credits were not spent.',
      });
    } else {
      setMessage({ ok: false, text: 'Payment received, still confirming. Your ad will appear in a moment.' });
    }
    setStep('result');
  };

  const onPaid = async () => {
    setStep('settling');
    finish(await waitForSettlement(checkout.bidId));
  };

  const demoPay = async () => {
    setStep('settling');
    try {
      finish((await api.demoPay(checkout.bidId)).status);
    } catch (err) {
      setError(err.message);
      setStep('pay');
    }
  };

  const price = formatMoney(amountCents);
  // On the pay screen, the server's split is the truth.
  const charge = formatMoney(checkout?.chargeCents ?? amountCents);
  const creditsUsed = checkout?.creditsCents ?? 0;

  let body;
  if (step === 'result') {
    body = (
      <div className="space-y-5">
        <div className={`border-2 border-ink p-4 ${message.ok ? 'bg-bh-yellow' : 'bg-muted'}`}>
          <p className="text-xl font-black uppercase tracking-tight">{message.ok ? 'Long live the king' : 'Not this time'}</p>
          <p className="mt-1 font-medium leading-relaxed">{message.text}</p>
        </div>
        <button onClick={reset} className="btn-outline w-full">
          {message.ok ? 'Bid again' : 'Try again'}
        </button>
      </div>
    );
  } else if (step === 'pay' || step === 'settling') {
    body = (
      <div className="space-y-5">
        <p className="font-medium leading-relaxed">
          Your ad passed the safety check. Pay <span className="font-black">{charge}</span> to take the throne
          {creditsUsed > 0 && <> ({formatMoney(creditsUsed)} covered by credits)</>}.
        </p>
        {step === 'settling' ? (
          <p className="label flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> Storming the castle
          </p>
        ) : paymentsMode === 'demo' ? (
          <>
            <button onClick={demoPay} className="btn w-full bg-ink text-white hover:bg-ink/90">
              Pay {charge} (demo)
            </button>
            <p className="text-sm text-ink/60">In production this is a one-tap Apple Pay / Google Pay sheet.</p>
          </>
        ) : (
          <StripeCheckout clientSecret={checkout.clientSecret} label={`Take the throne · ${charge}`} onPaid={onPaid} />
        )}
        {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
        {step === 'pay' && (
          <button onClick={reset} className="label w-full py-2 text-ink/60 hover:text-bh-red">
            Cancel
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <form onSubmit={submit} onPaste={onPaste} className="space-y-4">
        <Field label="Name / brand">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </Field>

        <Field label="Tagline" hint="Read aloud live">
          <input className="field" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={100} />
        </Field>

        <div>
          <span className="label mb-1.5 flex justify-between">
            Image <span className="text-ink/50">Optional</span>
          </span>
          {image ? (
            <div className="relative border-2 border-ink">
              <img src={image} alt="Your ad preview" className="aspect-video w-full bg-ink object-contain" />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove image"
                className="btn-outline btn-sm absolute right-2 top-2"
              >
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-ink bg-canvas px-4 py-6 text-center transition duration-200 hover:bg-bh-cream focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2">
              <ImagePlus className="h-7 w-7" strokeWidth={2.5} />
              <span className="text-sm font-bold uppercase tracking-wider">Upload or paste an image</span>
              <span className="text-xs text-ink/60">PNG, JPEG, GIF, WebP · 2 MB max</span>
              <input
                type="file"
                accept={ACCEPTED.join(',')}
                onChange={(e) => takeFile(e.target.files[0])}
                className="sr-only"
              />
            </label>
          )}
        </div>

        <Field label="Link" hint="Where clicks go">
          <input
            className="field"
            type="url"
            placeholder="https://"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            required
          />
        </Field>

        <div>
          <span className="label mb-1.5 flex justify-between">
            Your bid <span className="text-ink/50">Min {formatMoney(minNextBidCents)}</span>
          </span>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-black">$</span>
              <input
                className="field pl-7 text-lg font-black tabular-nums"
                type="number"
                inputMode="decimal"
                aria-label="Bid amount in dollars"
                min={minNextBidCents / 100}
                step="0.01"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
            </div>
            {[500, 2000].map((bump) => (
              <button
                key={bump}
                type="button"
                onClick={() => setAmountCents(minNextBidCents + bump)}
                className="btn-outline btn-sm rounded-full px-3"
              >
                +{bump / 100}
              </button>
            ))}
          </div>
          {/* Thumb-friendly on phones; stays in sync with the typed amount. */}
          <input
            type="range"
            aria-label="Bid amount slider"
            min={minNextBidCents}
            max={sliderMax}
            step={50}
            value={Math.min(Math.max(amountCents, minNextBidCents), sliderMax)}
            onChange={(e) => setAmountCents(Number(e.target.value))}
            className="mt-3 h-3 w-full cursor-pointer appearance-none border-2 border-ink bg-white accent-bh-red [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-bh-red [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-bh-red"
          />
          <div className="mt-1 flex justify-between text-xs font-bold tabular-nums text-ink/60">
            <span>{formatMoney(minNextBidCents)}</span>
            <span>{formatMoney(sliderMax)}</span>
          </div>
          <p className="mt-1.5 text-xs text-ink/60">
            Bigger bid, longer shield: +{rules.shieldSecondsPerDollar}s per extra dollar.
          </p>
        </div>

        {balanceCents > 0 && (
          <label className="flex cursor-pointer items-start gap-3 border-2 border-ink bg-bh-cream p-3">
            <input
              type="checkbox"
              checked={useCredits}
              onChange={(e) => setUseCredits(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-bh-blue"
            />
            <span className="text-sm font-medium leading-snug">
              <span className="font-bold uppercase tracking-wide">Use {formatMoney(balanceCents)} Throne Credits</span>
              {useCredits && (
                <span className="block text-ink/70">
                  Credits {formatMoney(split.creditsCents)} · you pay {formatMoney(split.chargeCents)}
                </span>
              )}
            </span>
          </label>
        )}

        {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}

        <Turnstile ref={turnstileRef} onToken={setBotToken} />

        <button
          type="submit"
          disabled={step === 'submitting' || amountCents < minNextBidCents || waitingForBotCheck}
          className="btn-red w-full text-lg"
        >
          {waitingForBotCheck && step !== 'submitting' ? (
            'Checking you are human…'
          ) : step === 'submitting' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> Checking your ad
            </>
          ) : split.chargeCents === 0 ? (
            `Take it with credits · ${price}`
          ) : (
            `Take the throne · ${formatMoney(split.chargeCents)}`
          )}
        </button>
        <p className="text-center text-xs text-ink/60">
          No account. Blocked ads are never charged. By bidding you agree to the{' '}
          <a href="/legal#terms" className="font-bold underline hover:text-bh-red">Terms</a> and{' '}
          <a href="/legal#ad-policy" className="font-bold underline hover:text-bh-red">Ad Policy</a>.
        </p>
      </form>
    );
  }

  return (
    <div className="card p-5 sm:p-6">
      <CornerMark index={0} />
      <p className="label text-bh-blue">Overthrow the monarch</p>
      <h2 className="display mb-6 mt-1 text-3xl sm:text-4xl">Take the throne</h2>
      {body}
      {/* Outside the bid form: it has its own restore form, and forms can't nest. */}
      {(step === 'form' || step === 'submitting') && <CreditsPanel wallet={wallet} onRestore={onWalletChange} />}
    </div>
  );
}
