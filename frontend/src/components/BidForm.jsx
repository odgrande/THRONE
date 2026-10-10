import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { amountToText, api, formatMoney, textToCents } from '../lib/api.js';
import { needsEmail as paymentNeedsEmail, regionInfo } from '../lib/region.js';
import { rememberOwnedAd } from '../lib/owned.js';
import { CornerMark } from './Shape.jsx';
import { t } from '../lib/i18n.js';
import AdFields, { EMPTY_AD, EmailField, addonFor, adPayload } from './AdFields.jsx';
import PayStep from './PayStep.jsx';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile.jsx';

export const RANGE_CLASS =
  'mt-3 h-3 w-full cursor-pointer appearance-none border-2 border-ink bg-paper accent-bh-red [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-bh-red [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-bh-red';

export function LegalNote() {
  return (
    <p className="text-center text-xs text-ink/60">
      {t('legal.agree')}{' '}
      <a href="/legal#terms" className="font-bold underline hover:text-bh-red">{t('legal.terms')}</a> {t('legal.and')}{' '}
      <a href="/legal#ad-policy" className="font-bold underline hover:text-bh-red">{t('legal.policy')}</a>.
    </p>
  );
}

// The rules, generated from the live config so they can never drift from
// what the server actually enforces.
export function ThroneRules({ rules }) {
  const items = [
    t('rules.1'),
    t('rules.2', { step: formatMoney(rules.minIncrementCents), pct: rules.minRaisePct }),
    t('rules.3', { pct: rules.shieldPremiumPct }),
    t('rules.4', { window: rules.crownOvertimeWindowSeconds, ext: rules.crownExtensionSeconds }),
    t('rules.5', { days: Math.round(rules.throneTermSeconds / 86400) }),
    t('rules.6', { pct: rules.relegationDiscountPct }),
  ];
  return (
    <details className="group border-2 border-ink bg-canvas">
      <summary className="label flex cursor-pointer list-none items-center justify-between px-3 py-2.5 hover:bg-bh-cream">
        {t('rules.title')}
        <span className="text-base transition duration-200 group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <ul className="space-y-1.5 border-t-2 border-ink bg-bh-cream px-3 py-3 text-sm font-medium">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-ink" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function BidForm({ minNextBidCents, rules, onPriceChange }) {
  const needsEmail = paymentNeedsEmail();
  const [ad, setAd] = useState(EMPTY_AD);
  const [email, setEmail] = useState('');
  const [amountText, setAmountText] = useState(amountToText(minNextBidCents));
  const amountCents = textToCents(amountText);
  const setAmountCents = (cents) => setAmountText(amountToText(cents));
  const { symbol, currency } = regionInfo();
  const sliderStep = rules.sliderStepCents ?? 50;
  const [step, setStep] = useState('form'); // form | submitting | pay | result
  const [checkout, setCheckout] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  // Slider spans the minimum to 4x it (at least +20 starting prices), in whole units.
  const sliderMax = Math.ceil(Math.max(minNextBidCents * 4, minNextBidCents + rules.startingPriceCents * 20) / sliderStep) * sliderStep;
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  const waitingForBotCheck = Boolean(TURNSTILE_SITE_KEY) && !botToken;

  // When someone else bids, never leave the form below the new minimum.
  useEffect(() => {
    setAmountText((cur) => {
      return textToCents(cur) < minNextBidCents ? amountToText(minNextBidCents) : cur;
    });
  }, [minNextBidCents]);

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
      const res = await api.createBid({ ...(await adPayload(ad)), amountCents, turnstileToken: botToken, ...(needsEmail ? { email } : {}) });
      rememberOwnedAd(res);
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

  const finish = ({ status }) => {
    if (status === 'won') {
      setMessage({ ok: true, text: t('bid.won') });
      setAd(EMPTY_AD);
    } else if (status === 'review') {
      setMessage({ ok: true, title: t('media.reviewTitle'), text: t('media.reviewThrone') });
      setAd(EMPTY_AD);
    } else if (status === 'refunded' || status === 'outbid') {
      setMessage({ ok: false, text: t('bid.refunded') });
    } else {
      setMessage({ ok: false, text: t('bid.pending') });
    }
    setStep('result');
  };

  let body;
  if (step === 'result') {
    body = (
      <div className="space-y-5">
        <div className={`border-2 border-ink p-4 ${message.ok ? 'bg-bh-yellow' : 'bg-muted'}`}>
          <p className="text-xl font-black uppercase tracking-tight">{message.title ?? (message.ok ? t('bid.wonTitle') : t('bid.lostTitle'))}</p>
          <p className="mt-1 font-medium leading-relaxed">{message.text}</p>
        </div>
        <button onClick={reset} className="btn-outline w-full">
          {message.ok ? t('bid.again') : t('bid.tryAgain')}
        </button>
      </div>
    );
  } else if (step === 'pay') {
    body = <PayStep checkout={checkout} onDone={finish} onCancel={reset} />;
  } else {
    body = (
      <form onSubmit={submit} className="space-y-4">
        <AdFields ad={ad} onChange={setAd} onError={setError} idPrefix="throne" mapAddonCents={rules.mapAddonCents} videoAddonCents={rules.videoAddonCents} />

        <div>
          <span className="label mb-1.5 flex justify-between">
            {t('bid.yourBid')}
            {amountCents < minNextBidCents ? (
              <span className="text-bh-red" role="status">{t('bid.mustBe', { amount: formatMoney(minNextBidCents) })}</span>
            ) : (
              <span className="text-ink/50">{t('bid.min', { amount: formatMoney(minNextBidCents) })}</span>
            )}
          </span>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-black">{symbol}</span>
              <input
                className="field pl-7 text-lg font-black tabular-nums"
                type="number"
                inputMode="decimal"
                aria-label={`Bid amount in ${currency === 'NGN' ? 'naira' : 'dollars'}`}
                min={minNextBidCents / 100}
                step={currency === 'NGN' ? '1' : '0.01'}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
            </div>
            {(rules.bumpCents ?? [500, 2000]).map((bump) => (
              <button key={bump} type="button" onClick={() => setAmountCents(minNextBidCents + bump)} className="btn-outline btn-sm rounded-full px-3">
                +{(bump / 100).toLocaleString()}
              </button>
            ))}
          </div>
          {/* Thumb-friendly on phones; stays in sync with the typed amount. */}
          <input
            type="range"
            aria-label="Bid amount slider"
            min={minNextBidCents}
            max={sliderMax}
            step={sliderStep}
            value={Math.min(Math.max(amountCents, minNextBidCents), sliderMax)}
            onChange={(e) => setAmountCents(Number(e.target.value))}
            className={RANGE_CLASS}
          />
          <div className="mt-1 flex justify-between text-xs font-bold tabular-nums text-ink/60">
            <span>{formatMoney(minNextBidCents)}</span>
            <span>{formatMoney(sliderMax)}</span>
          </div>
          <p className="mt-1.5 text-xs text-ink/60">
            {t('bid.shield', {
              seconds: rules.shieldSecondsPerStep,
              step: formatMoney(rules.shieldStepCents),
              days: Math.round(rules.throneTermSeconds / 86400),
            })}
          </p>
        </div>

        {needsEmail && <EmailField value={email} onChange={setEmail} idPrefix="throne" />}

        {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}

        <Turnstile ref={turnstileRef} onToken={setBotToken} />

        <button type="submit" disabled={step === 'submitting' || amountCents < minNextBidCents || waitingForBotCheck} className="btn-red w-full text-lg">
          {waitingForBotCheck && step !== 'submitting' ? (
            t('bid.human')
          ) : step === 'submitting' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> {t('bid.checking')}
            </>
          ) : addonFor(ad, rules) > 0 ? (
            t('bid.submitExtras', { amount: formatMoney(amountCents), extras: formatMoney(addonFor(ad, rules)) })
          ) : (
            t('bid.submit', { amount: formatMoney(amountCents) })
          )}
        </button>
        <LegalNote />
        <ThroneRules rules={rules} />
      </form>
    );
  }

  return (
    <div className="card p-5 sm:p-6">
      <CornerMark index={0} />
      <p className="label text-bh-blue">{t('bid.kicker')}</p>
      <h2 className="display mb-6 mt-1 text-3xl sm:text-4xl">{t('bid.title')}</h2>
      {body}
    </div>
  );
}
