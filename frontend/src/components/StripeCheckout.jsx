import { useState } from 'react';
// The /pure build does not load Stripe's script on import: it only loads
// when a Stripe checkout actually opens (this file is itself lazy-loaded).
import { loadStripe } from '@stripe/stripe-js/pure';
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
// Wallet-first: Apple Pay / Google Pay need Face ID / fingerprint, which card-testing
// bots can't fake. Set VITE_ALLOW_CARDS=false to hide typed-in card entry entirely.
const allowCards = import.meta.env.VITE_ALLOW_CARDS !== 'false';

// Stripe renders in its own iframe, so the Bauhaus tokens are passed in here.
const appearance = {
  theme: 'flat',
  variables: {
    fontFamily: 'Outfit, system-ui, sans-serif',
    colorPrimary: '#1040C0',
    colorBackground: '#FFFFFF',
    colorText: '#121212',
    colorDanger: '#D02020',
    borderRadius: '0px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '2px solid #121212', boxShadow: 'none' },
    '.Input:focus': { backgroundColor: '#FFF9C4', boxShadow: 'none' },
    '.Tab': { border: '2px solid #121212', boxShadow: '3px 3px 0px 0px #121212' },
    '.Tab--selected': { backgroundColor: '#F0C020', color: '#121212' },
    '.Label': { fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '12px' },
  },
};
const fonts = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;900&display=swap' }];

function Checkout({ label, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [walletsReady, setWalletsReady] = useState(null); // null = still detecting

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const { error: payError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    });
    setBusy(false);
    if (payError) setError(payError.message);
    else onPaid();
  };

  return (
    <div className="space-y-4">
      <ExpressCheckoutElement
        options={{ buttonType: { applePay: 'buy', googlePay: 'buy' }, paymentMethods: { link: 'never' } }}
        onReady={({ availablePaymentMethods }) => setWalletsReady(Boolean(availablePaymentMethods))}
        onConfirm={confirm}
      />

      {walletsReady === false && !allowCards && (
        <p className="border-2 border-ink bg-muted p-3 text-sm font-medium">
          Open this page on a phone or browser with Apple Pay or Google Pay set up to take the throne.
        </p>
      )}

      {allowCards && (
        <>
          {walletsReady && (
            <p className="label flex items-center gap-3 text-ink/60">
              <span className="h-0.5 flex-1 bg-ink" /> or card <span className="h-0.5 flex-1 bg-ink" />
            </p>
          )}
          <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }} />
          <button onClick={confirm} disabled={!stripe || busy} className="btn-red w-full">
            {busy ? 'Paying...' : label}
          </button>
        </>
      )}

      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
    </div>
  );
}

export default function StripeCheckout({ clientSecret, label, onPaid }) {
  if (!stripePromise) {
    return <p className="font-bold text-bh-red">VITE_STRIPE_PUBLISHABLE_KEY is not set in frontend/.env.</p>;
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance, fonts }}>
      <Checkout label={label} onPaid={onPaid} />
    </Elements>
  );
}
