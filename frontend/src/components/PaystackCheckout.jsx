import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { t } from '../lib/i18n.js';

// Paystack's inline checkout (card, bank transfer, USSD). The server has
// already initialised the transaction, so the popup only needs its access
// code; the webhook (verified server-side) is what actually puts the ad live.
const SCRIPT = 'https://js.paystack.co/v2/inline.js';
let loading = null;

function loadPaystack() {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  loading ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => (window.PaystackPop ? resolve(window.PaystackPop) : reject(new Error('Paystack did not load')));
    tag.onerror = () => {
      loading = null;
      reject(new Error('Could not load Paystack. Check your connection and try again.'));
    };
    document.head.appendChild(tag);
  });
  return loading;
}

export default function PaystackCheckout({ accessCode, authorizationUrl, label, onPaid }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const PaystackPop = await loadPaystack();
      new PaystackPop().resumeTransaction(accessCode, {
        onSuccess: () => onPaid(),
        onCancel: () => setBusy(false),
        onError: (err) => {
          setError(err?.message ?? 'Payment failed. Please try again.');
          setBusy(false);
        },
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={pay} disabled={busy} className="btn w-full bg-onyx text-white hover:bg-onyx/90">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> : label}
      </button>
      <p className="text-center text-xs text-ink/60">
        {t('pay.paystack')}{' '}
        {authorizationUrl && (
          <a href={authorizationUrl} target="_blank" rel="noopener noreferrer" onClick={() => onPaid()} className="font-bold underline hover:text-bh-red">
            {t('pay.popup')}
          </a>
        )}
      </p>
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
    </div>
  );
}
