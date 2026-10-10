import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { assertProductionConfig, config } from './config.js';
import { createStore } from './store/index.js';
import { createPayments } from './services/payments.js';
import { createModeration } from './services/moderation.js';
import { createLinkChecker, normalizeTargetUrl } from './services/linkSafety.js';
import { createRealtime } from './services/realtime.js';
import { createHypeQueue } from './services/hype.js';
import { decodeImage, saveImage } from './services/images.js';
import { createStorage, LOCAL_DIRS } from './services/storage.js';
import { createTurnstile } from './services/turnstile.js';
import { findOrCreateWallet, findWallet } from './services/wallets.js';
import { createGame } from './game.js';
import { assessHealth, requireAdmin } from './admin.js';

assertProductionConfig('api');

const store = createStore(config);
const storage = createStorage(config);
const payments = createPayments(config.stripe);
const moderation = createModeration(config.openaiApiKey);
const links = createLinkChecker(config.webRiskApiKey);
const turnstile = createTurnstile(config.turnstileSecret);
const realtime = createRealtime();
const hype = createHypeQueue({ store, minCents: config.hype.minCents });
const game = createGame({ store, payments, realtime, hype, rules: config.rules });

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// Origin lock: Cloudflare adds a secret header (a Transform Rule, see DEPLOY.md).
// Requests that skip Cloudflare and hit the host directly (*.onrender.com) are
// refused, so the WAF can't be bypassed and client IPs can't be spoofed via
// X-Forwarded-For. The health check is exempt for the host's own probes.
if (config.originSecret) {
  const expected = Buffer.from(config.originSecret);
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    const sent = Buffer.from(req.get('x-origin-secret') ?? '');
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return res.status(403).end();
    next();
  });
}
// Images are loaded cross-origin by the frontend, so allow that one policy.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigin }));

// --- Stripe webhook ---
// Registered before the JSON parser (signature checks need the raw body) and
// before the rate limiter (Stripe retries must never be throttled).
// This is the ONLY way an ad goes live in production: the event must carry a
// valid Stripe signature, so a forged "I paid $1000" request is rejected.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (payments.mode !== 'stripe') return res.status(404).end();

  let event;
  try {
    event = payments.constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    return res.status(400).send(`Webhook signature error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    try {
      await game.settle(intent.metadata.bidId, intent.id);
    } catch (err) {
      console.error('[webhook] settle failed; Stripe will retry', err);
      return res.status(500).end();
    }
  }
  res.json({ received: true });
});

const limiter = (limit, error) =>
  rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error } });

// Global per-IP ceiling for everything else under /api.
app.use('/api', limiter(300, 'Too many requests. Slow down for a minute.'));
app.use(express.json({ limit: '4mb' }));

// Local-disk media (dev only; production serves it from Supabase Storage).
if (storage.kind === 'local') {
  app.use(
    '/uploads',
    express.static(LOCAL_DIRS.uploads, {
      immutable: true,
      maxAge: '365d',
      setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; sandbox"),
    }),
  );
  app.use('/renders', express.static(LOCAL_DIRS.renders, { maxAge: '1d' }));
}

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    store: store.kind,
    storage: storage.kind,
    payments: payments.mode,
    moderation: moderation.enabled,
    linkChecks: links.enabled,
    botCheck: turnstile.enabled,
  }),
);

app.get('/api/state', async (_req, res, next) => {
  try {
    res.json(await game.getState());
  } catch (err) {
    next(err);
  }
});

app.get('/api/events', realtime.handler);

// --- Throne Credits ---
app.get('/api/wallet', async (req, res, next) => {
  try {
    const wallet = await findWallet(store, req.get('x-wallet-token'));
    res.json({
      balanceCents: wallet?.balanceCents ?? 0,
      lifetimeEarnedCents: wallet?.lifetimeEarnedCents ?? 0,
      known: Boolean(wallet),
      cashoutEnabled: config.credits.cashoutEnabled,
      cashoutMinCents: config.credits.cashoutMinCents,
    });
  } catch (err) {
    next(err);
  }
});

// --- Admin: financial health (credit liability vs. cash) ---
if (config.adminToken) {
  app.get(
    '/api/admin/health',
    limiter(30, 'Too many admin requests.'),
    requireAdmin(config.adminToken),
    async (_req, res, next) => {
      try {
        const financials = await store.getFinancials();
        let stripeBalance = null;
        try {
          stripeBalance = await payments.getBalance();
        } catch (err) {
          console.error('[admin] Stripe balance unavailable', err.message);
        }
        res.set('Cache-Control', 'no-store').json(assessHealth(financials, stripeBalance));
      } catch (err) {
        next(err);
      }
    },
  );
}

// --- Hype videos (latest renders, for the team / a future gallery) ---
app.get('/api/hype', async (_req, res, next) => {
  try {
    res.json({ jobs: await store.listHypeJobs(20) });
  } catch (err) {
    next(err);
  }
});

// --- History of Kings ---
app.get('/api/legends', async (req, res, next) => {
  try {
    const sort = ['recent', 'longest', 'priciest'].includes(req.query.sort) ? req.query.sort : 'recent';
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    res.json(await store.getLegends({ sort, limit, offset }));
  } catch (err) {
    next(err);
  }
});

// --- Kings of the Day ---
app.get('/api/crowns', async (req, res, next) => {
  try {
    const limit = Math.min(60, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    res.json({ kings: await game.getDayKings(limit) });
  } catch (err) {
    next(err);
  }
});

// --- Outbound link interstitial ---
// The billboard never links straight out: it opens /go/:id, which shows the
// destination and a warning before the visitor continues.
const visibleBid = async (id) => {
  const bid = await store.getBid(id);
  return bid && bid.status === 'won' ? bid : null;
};

app.get('/api/go/:id', async (req, res, next) => {
  try {
    const bid = await visibleBid(req.params.id);
    if (!bid) return res.status(404).json({ error: 'Ad not found.' });
    res.json({ name: bid.name, targetUrl: bid.targetUrl, host: new URL(bid.targetUrl).host });
  } catch (err) {
    next(err);
  }
});

const clickLimiter = limiter(20, 'Too many clicks. Try again in a minute.');

app.post('/api/go/:id', clickLimiter, async (req, res, next) => {
  try {
    const bid = await visibleBid(req.params.id);
    if (!bid) return res.status(404).json({ error: 'Ad not found.' });
    await store.recordClick(bid.id);
    res.json({ targetUrl: bid.targetUrl });
  } catch (err) {
    next(err);
  }
});

// --- Submit a bid: validate -> link check -> moderate -> store image -> create payment ---
// Unpaid bids are cheap to send, so this is far stricter than the global limit.
const bidLimiter = limiter(config.bidsPerMinute, 'Too many bid attempts. Wait a minute and try again.');

const MAX_BID_CENTS = 1_000_000; // $10,000 sanity cap

function validateBid(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const tagline = typeof body.tagline === 'string' ? body.tagline.trim() : '';
  const amountCents = body.amountCents;

  if (name.length < 1 || name.length > 40) return { error: 'Name must be 1-40 characters.' };
  if (tagline.length > 100) return { error: 'Tagline must be 100 characters or fewer.' };
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_BID_CENTS) {
    return { error: 'Invalid bid amount.' };
  }

  let targetUrl;
  try {
    targetUrl = normalizeTargetUrl(body.targetUrl);
  } catch (err) {
    return { error: err.message };
  }
  return { name, tagline, targetUrl, amountCents };
}

app.post('/api/bids', bidLimiter, async (req, res, next) => {
  try {
    const input = validateBid(req.body);
    if (input.error) return res.status(400).json({ error: input.error });

    // Bot check first: it's free, and it stops card-testing scripts before
    // they cost a moderation call or ever reach Stripe.
    let human;
    try {
      human = await turnstile.verify(req.body.turnstileToken, req.ip);
    } catch (err) {
      console.error('[turnstile]', err);
      return res.status(503).json({ error: "We couldn't run the bot check. Please try again in a moment.", retryTurnstile: true });
    }
    if (!human) {
      return res.status(403).json({ error: 'Bot check failed or expired. Please try again.', retryTurnstile: true });
    }

    const minNext = await game.getMinNextBidCents();
    if (input.amountCents < minNext) {
      return res
        .status(409)
        .json({ error: `Bid must be at least $${(minNext / 100).toFixed(2)}. Amount updated.`, minNextBidCents: minNext });
    }

    let image = null;
    if (req.body.image) {
      try {
        image = decodeImage(req.body.image);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    let linkVerdict;
    try {
      linkVerdict = await links.check(input.targetUrl);
    } catch (err) {
      console.error('[links]', err);
      return res.status(503).json({ error: "We couldn't verify that link right now. Please try again in a moment." });
    }
    if (!linkVerdict.ok) {
      return res.status(422).json({ error: 'That link is flagged as unsafe (malware or phishing). You have not been charged.' });
    }

    const verdict = await moderation.check({
      text: [input.name, input.tagline, input.targetUrl].filter(Boolean).join('\n'),
      imageDataUrl: image?.dataUrl,
    });
    if (!verdict.ok) {
      return res.status(422).json({ error: 'This ad breaks the content rules, so it was blocked. You have not been charged.' });
    }

    const imageUrl = image ? await saveImage(image, storage) : null;
    const { wallet, newToken } = await findOrCreateWallet(store, req.body.walletToken);
    const bid = await game.createBid({ ...input, imageUrl }, wallet, req.body.useCredits === true);

    const reply = {
      bidId: bid.id,
      paymentsMode: payments.mode,
      creditsCents: bid.creditsCents,
      chargeCents: bid.chargeCents,
      // Sent once, when the wallet is created; the browser must keep it.
      walletToken: newToken,
    };

    // Paid entirely in Throne Credits: nothing to charge, settle right now.
    if (bid.chargeCents === 0) {
      await game.settle(bid.id, null);
      const settled = await store.getBid(bid.id);
      return res.status(201).json({ ...reply, status: settled.status });
    }

    const { clientSecret } = await payments.createIntent({
      bidId: bid.id,
      amountCents: bid.chargeCents,
      description: `Throne bid by ${bid.name}`,
    });
    res.status(201).json({ ...reply, clientSecret });
  } catch (err) {
    next(err);
  }
});

app.get('/api/bids/:id/status', async (req, res, next) => {
  try {
    const bid = await store.getBid(req.params.id);
    if (!bid) return res.status(404).json({ error: 'Bid not found.' });
    res.json({ status: bid.status });
  } catch (err) {
    next(err);
  }
});

// Demo mode only: stands in for a cleared Apple Pay / Google Pay payment.
// config.js refuses to start in production without Stripe, so this route
// can never be reached on a live deployment.
app.post('/api/bids/:id/demo-pay', async (req, res, next) => {
  if (payments.mode !== 'demo') return res.status(404).end();
  try {
    const result = await game.settle(req.params.id, `demo_${req.params.id}`);
    if (result.status === 'missing') return res.status(404).json({ error: 'Bid not found.' });
    const bid = await store.getBid(req.params.id);
    res.json({ status: bid.status });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Crowns the King of the Day when a round ends, even if nobody is bidding.
let crownTickRunning = false;
setInterval(async () => {
  if (crownTickRunning) return;
  crownTickRunning = true;
  try {
    await game.tickCrown();
  } catch (err) {
    console.error('[crown] tick failed', err);
  } finally {
    crownTickRunning = false;
  }
}, 1000).unref();

if (config.hype.inlineWorker) {
  // Imported lazily: the renderer is heavy and most API boxes don't need it.
  const { startVideoWorker } = await import('./workers/videoWorker.js');
  startVideoWorker({ store, storage, siteLabel: new URL(config.siteUrl).host });
}

app.listen(config.port, () => {
  console.log(`Throne backend on http://localhost:${config.port}`);
  console.log(
    `  store=${store.kind} payments=${payments.mode} moderation=${moderation.enabled ? 'on' : 'OFF'} linkChecks=${links.enabled ? 'on' : 'OFF'}`,
  );
});
