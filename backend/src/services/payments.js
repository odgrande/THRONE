import { createHmac, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';

// Payments are routed per region: each region names its processor.
//   global → Stripe (or Paystack in USD, once Paystack approves USD for you)
//   ng     → Paystack (NGN: cards, bank transfer, USSD)
// A region without keys runs the demo processor (fake pay button), which the
// production config refuses outside a staging deploy.

function demoProvider(region) {
  return {
    mode: 'demo',
    async createIntent() {
      return {};
    },
    async refund(paymentRef, amountCents, reason) {
      console.log(`[payments:demo:${region}] refund ${amountCents} on ${paymentRef} (${reason})`);
    },
    async getBalance() {
      return null;
    },
  };
}

function stripeProvider({ secretKey, webhookSecret, threeDS }) {
  const stripe = new Stripe(secretKey);
  return {
    mode: 'stripe',

    // The ad itself lives in our DB; Stripe only carries its id.
    async createIntent({ bidId, amountCents, currency, description }) {
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: currency.toLowerCase(),
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

    constructWebhookEvent(rawBody, signature) {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },

    // Real cash held by Stripe: available now + pending settlement.
    async getBalance(currency) {
      const balance = await stripe.balance.retrieve();
      const pick = (list) => list.filter((b) => b.currency === currency.toLowerCase()).reduce((sum, b) => sum + b.amount, 0);
      return { availableCents: pick(balance.available), pendingCents: pick(balance.pending) };
    },
  };
}

// Paystack: Nigeria's main processor (owned by Stripe). Amounts are in the
// currency's minor unit (kobo for NGN, cents for USD).
export function paystackProvider({ secretKey, apiBase = 'https://api.paystack.co' }) {
  async function call(method, path, body) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status !== true) {
      throw new Error(`Paystack ${method} ${path} failed (${res.status}): ${json.message ?? 'unknown error'}`);
    }
    return json.data;
  }

  return {
    mode: 'paystack',

    // Paystack requires a customer email (it sends them the receipt). We pass
    // it through and do not store it. The reference is our ad id, so the
    // webhook maps straight back to the ad.
    async createIntent({ bidId, amountCents, currency, email, description }) {
      const data = await call('POST', '/transaction/initialize', {
        email,
        amount: amountCents,
        currency,
        reference: bidId,
        metadata: { bidId, description },
        channels: ['card', 'bank', 'ussd', 'bank_transfer'],
      });
      return { accessCode: data.access_code, authorizationUrl: data.authorization_url };
    },

    async refund(paymentRef, amountCents, reason) {
      await call('POST', '/refund', { transaction: paymentRef, amount: amountCents, merchant_note: reason });
    },

    // Webhook authenticity: HMAC-SHA512 of the raw body with the secret key.
    verifySignature(rawBody, signature) {
      if (typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature)) return false;
      const expected = createHmac('sha512', secretKey).update(rawBody).digest();
      return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
    },

    // Belt and braces: ask Paystack directly before trusting a webhook.
    async verifyTransaction(reference) {
      return call('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    },

    async getBalance(currency) {
      const list = await call('GET', '/balance');
      const row = list.find((b) => b.currency === currency);
      return row ? { availableCents: row.balance, pendingCents: 0 } : null;
    },
  };
}

// Flutterwave Standard (v3): a hosted payment page. Amounts are in MAJOR
// units (dollars), so we convert from our cents. The reference (tx_ref) is
// our ad id; refunds need Flutterwave's numeric transaction id, which we look
// up by reference.
export function flutterwaveProvider({ secretKey, webhookHash, apiBase = 'https://api.flutterwave.com', siteUrl }) {
  async function call(method, path, body) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status !== 'success') {
      throw new Error(`Flutterwave ${method} ${path} failed (${res.status}): ${json.message ?? 'unknown error'}`);
    }
    return json.data;
  }
  const major = (cents) => Math.round(cents) / 100;

  const verifyTransaction = async (reference) => {
    const tx = await call('GET', `/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
    // Normalised for the webhook check: amount back in cents.
    return { ...tx, amountCents: Math.round(Number(tx.amount) * 100) };
  };

  return {
    mode: 'flutterwave',

    // The buyer's email is required by Flutterwave for the receipt; passed
    // through, not stored. After paying they come back to My ads.
    async createIntent({ bidId, amountCents, currency, email, description, returnPath = '/my-ads?paid=1' }) {
      const data = await call('POST', '/v3/payments', {
        tx_ref: bidId,
        amount: major(amountCents),
        currency,
        redirect_url: `${siteUrl}${returnPath}`,
        customer: { email },
        customizations: { title: 'Throne', description: String(description).slice(0, 120) },
        meta: { bidId },
      });
      return { authorizationUrl: data.link };
    },

    async refund(paymentRef, amountCents, reason) {
      const tx = await verifyTransaction(paymentRef);
      await call('POST', `/v3/transactions/${encodeURIComponent(tx.id)}/refund`, { amount: major(amountCents), comments: reason });
    },

    // Webhook authenticity: the verif-hash header must equal our secret hash.
    verifySignature(headerValue) {
      if (typeof headerValue !== 'string' || !webhookHash) return false;
      const a = Buffer.from(headerValue);
      const b = Buffer.from(webhookHash);
      return a.length === b.length && timingSafeEqual(a, b);
    },

    verifyTransaction,

    async getBalance(currency) {
      const data = await call('GET', `/v3/balances/${encodeURIComponent(currency)}`);
      return data ? { availableCents: Math.round(Number(data.available_balance) * 100), pendingCents: Math.round(Number(data.ledger_balance - data.available_balance || 0) * 100) } : null;
    },
  };
}

export function createPayments({ stripe, paystack, flutterwave, processors, regions }) {
  const providers = {};
  for (const [region, processor] of Object.entries(processors)) {
    if (processor === 'stripe') providers[region] = stripeProvider(stripe);
    else if (processor === 'paystack') providers[region] = paystackProvider(paystack);
    else if (processor === 'flutterwave') providers[region] = flutterwaveProvider(flutterwave);
    else providers[region] = demoProvider(region);
    console.log(`[payments] ${region}: ${providers[region].mode}${providers[region].mode === 'demo' ? ' (simulated, no real money)' : ''}`);
  }
  const of = (region) => {
    const p = providers[region];
    if (!p) throw new Error(`no payment processor for region ${region}`);
    return p;
  };

  return {
    modeFor: (region) => of(region).mode,
    createIntent: ({ region, ...rest }) => of(region).createIntent({ ...rest, currency: regions[region].currency }),
    refund: (region, ...args) => of(region).refund(...args),
    getBalance: (region) => of(region).getBalance(regions[region].currency),
    // Webhook helpers, used only by the matching webhook route.
    stripe: Object.values(providers).find((p) => p.mode === 'stripe') ?? null,
    paystack: Object.values(providers).find((p) => p.mode === 'paystack') ?? null,
    flutterwave: Object.values(providers).find((p) => p.mode === 'flutterwave') ?? null,
  };
}
