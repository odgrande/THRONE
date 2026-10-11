import { lazy, Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
// Loaded only for a Stripe checkout, so Stripe's scripts never run elsewhere.
const StripeCheckout = lazy(() => import('./StripeCheckout.jsx'));
import { t } from '../lib/i18n.js';
import PaystackCheckout from './PaystackCheckout.jsx';
import FlutterwaveCheckout from './FlutterwaveCheckout.jsx';

// Polls until the payment webhook has settled the ad (usually under a second).
async function waitForSettlement(bidId, tries = 60, everyMs = 500) {
  // Bank transfers and USSD can take a little longer than cards.
  for (let i = 0; i < tries; i++) {
    const result = await api.bidStatus(bidId);
    if (result.status !== 'pending') return result;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return { status: 'pending' };
}

// The payment step shared by throne bids, board bookings and relegations.
// `checkout` is the server's reply to creating the ad; onDone receives the
// settled status ({ status, startsAt, endsAt }).
// Coin packs reuse it with their own demoPay / waitFor (an order, not an ad).
export default function PayStep({ checkout, intro, onDone, onCancel, demoPay, waitFor, nonRefundable }) {
  const demo = demoPay ?? (() => api.demoPay(checkout.bidId));
  const wait = waitFor ?? ((tries, everyMs) => waitForSettlement(checkout.bidId, tries, everyMs));
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState(null);
  const price = formatMoney(checkout.amountCents, checkout.region);

  const finish = async (getResult) => {
    setSettling(true);
    setError(null);
    try {
      onDone(await getResult());
    } catch (err) {
      setError(err.message);
      setSettling(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="font-medium leading-relaxed">{intro ?? t('pay.intro', { amount: price })}</p>
      {settling ? (
        <p className="label flex items-center justify-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> {t('pay.putting')}
        </p>
      ) : checkout.paymentsMode === 'demo' ? (
        <>
          <button onClick={() => finish(demo)} className="btn w-full bg-onyx text-white hover:bg-onyx/90">
            Pay {price} (demo)
          </button>
          <p className="text-sm text-ink/60">Test site: payments are simulated. No money moves.</p>
        </>
      ) : checkout.paymentsMode === 'flutterwave' ? (
        <FlutterwaveCheckout
          authorizationUrl={checkout.authorizationUrl}
          label={t('pay.button', { amount: price })}
          // The buyer pays in another tab: keep checking for up to 15 minutes.
          onPaid={() => finish(() => wait(300, 3000))}
        />
      ) : checkout.paymentsMode === 'paystack' ? (
        <PaystackCheckout
          accessCode={checkout.accessCode}
          authorizationUrl={checkout.authorizationUrl}
          label={t('pay.button', { amount: price })}
          onPaid={() => finish(() => wait())}
        />
      ) : (
        <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" strokeWidth={3} />}>
          <StripeCheckout clientSecret={checkout.clientSecret} label={`Pay ${price}`} onPaid={() => finish(() => wait())} />
        </Suspense>
      )}
      <p className="text-center text-xs font-bold">
        {nonRefundable ?? t('pay.nonRefundable')}{' '}
        <a href="/legal#terms" target="_blank" rel="noopener" className="underline hover:text-bh-red">
          {t('pay.refundRules')}
        </a>
      </p>
      {checkout.vatPct > 0 && <p className="text-center text-xs text-ink/60">{t('pay.vat', { pct: checkout.vatPct })}</p>}
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
      {!settling && (
        <button onClick={onCancel} className="label w-full py-2 text-ink/60 hover:text-bh-red">
          {t('pay.cancel')}
        </button>
      )}
    </div>
  );
}
