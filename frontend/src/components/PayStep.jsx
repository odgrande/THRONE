import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import StripeCheckout from './StripeCheckout.jsx';

// Polls until the payment webhook has settled the ad (usually under a second).
async function waitForSettlement(bidId) {
  for (let i = 0; i < 30; i++) {
    const result = await api.bidStatus(bidId);
    if (result.status !== 'pending') return result;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { status: 'pending' };
}

// The payment step shared by throne bids, board bookings and relegations.
// `checkout` is the server's reply to creating the ad; onDone receives the
// settled status ({ status, startsAt, endsAt }).
export default function PayStep({ checkout, intro, onDone, onCancel }) {
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState(null);
  const price = formatMoney(checkout.amountCents);

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
      <p className="font-medium leading-relaxed">{intro ?? <>Your ad passed the safety check. Pay <span className="font-black">{price}</span> to go live.</>}</p>
      {settling ? (
        <p className="label flex items-center justify-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> Putting your ad up
        </p>
      ) : checkout.paymentsMode === 'demo' ? (
        <>
          <button onClick={() => finish(() => api.demoPay(checkout.bidId))} className="btn w-full bg-onyx text-white hover:bg-onyx/90">
            Pay {price} (demo)
          </button>
          <p className="text-sm text-ink/60">Test site: payments are simulated. No money moves.</p>
        </>
      ) : (
        <StripeCheckout clientSecret={checkout.clientSecret} label={`Pay ${price}`} onPaid={() => finish(() => waitForSettlement(checkout.bidId))} />
      )}
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
      {!settling && (
        <button onClick={onCancel} className="label w-full py-2 text-ink/60 hover:text-bh-red">
          Cancel
        </button>
      )}
    </div>
  );
}
