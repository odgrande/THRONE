import Stripe from 'stripe';

export function createPayments({ secretKey, webhookSecret, threeDS }) {
  if (!secretKey) {
    console.warn('[payments] STRIPE_SECRET_KEY not set: using DEMO payments (no real money).');
    return {
      mode: 'demo',
      async createIntent() {
        return { clientSecret: null };
      },
      async refund(paymentRef, amountCents, reason) {
        console.log(`[payments:demo] refund ${amountCents}c on ${paymentRef} (${reason})`);
      },
      async getBalance() {
        return null;
      },
    };
  }

  const stripe = new Stripe(secretKey);

  return {
    mode: 'stripe',

    // The bid itself lives in our DB; Stripe only carries its id.
    async createIntent({ bidId, amountCents, description }) {
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        description,
        // Enables Apple Pay / Google Pay / Link wherever the device supports them.
        automatic_payment_methods: { enabled: true },
        // Typed-in cards get a bank challenge; wallet payments are already
        // device-authenticated (Face ID / fingerprint) and skip it.
        payment_method_options: { card: { request_three_d_secure: threeDS } },
        metadata: { bidId },
      });
      return { clientSecret: intent.client_secret };
    },

    async refund(paymentRef, amountCents, reason) {
      await stripe.refunds.create(
        { payment_intent: paymentRef, amount: amountCents, metadata: { reason } },
        // Webhook retries must not refund twice.
        { idempotencyKey: `${reason}:${paymentRef}:${amountCents}` },
      );
    },

    // Real USD cash held by Stripe: available now + pending settlement.
    async getBalance() {
      const balance = await stripe.balance.retrieve();
      const usd = (list) => list.filter((b) => b.currency === 'usd').reduce((sum, b) => sum + b.amount, 0);
      return { availableCents: usd(balance.available), pendingCents: usd(balance.pending) };
    },

    constructWebhookEvent(rawBody, signature) {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },
  };
}
