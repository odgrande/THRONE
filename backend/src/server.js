import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { assertProductionConfig, config, REGION_IDS } from './config.js';
import { createStore } from './store/index.js';
import { createPayments } from './services/payments.js';
import { createModeration } from './services/moderation.js';
import { createLinkChecker, normalizeTargetUrl } from './services/linkSafety.js';
import { createRealtime } from './services/realtime.js';
import { createHypeQueue } from './services/hype.js';
import { decodeImage, saveImage } from './services/images.js';
import { createVideoUploads, MAX_VIDEO_BYTES } from './services/videos.js';
import { isOwner } from './services/owners.js';
import { createStorage, LOCAL_DIRS } from './services/storage.js';
import { createTurnstile } from './services/turnstile.js';
import { newOwnerToken } from './services/owners.js';
import { BOARD_IDS, BOOKING_DAYS, bookingPriceCents } from './rules.js';
import { createGame, maskRemoved } from './game.js';
import { assessHealth, requireAdmin } from './admin.js';

assertProductionConfig('api');

const store = createStore(config);
const storage = createStorage(config);
const payments = createPayments({ stripe: config.stripe, paystack: config.paystack, processors: config.processors, regions: config.regions });
const moderation = createModeration(config.openaiApiKey);
const links = createLinkChecker(config.webRiskApiKey);
const turnstile = createTurnstile(config.turnstileSecret);
// Each live viewer is counted in the edition they're watching (?region=, else country).
const realtime = createRealtime({ regions: REGION_IDS, regionOf: (req) => regionOf(req) });
const hype = createHypeQueue({ store });
const game = createGame({ store, payments, realtime, hype, regions: config.regions, storage });
const videos = createVideoUploads({ storage, secret: config.reports.ipHashSalt });

// Which region a request is about. An explicit choice (?region= or the
// X-Region header) wins; otherwise visitors in Nigeria get the Naira throne,
// using the country Cloudflare stamps on every request (CF-IPCountry; only
// trusted because the origin lock ensures requests came through Cloudflare).
const isRegion = (r) => typeof r === 'string' && REGION_IDS.includes(r);
const countryOf = (req) => (req.get('cf-ipcountry') ?? '').toUpperCase();
const regionOf = (req) => {
  const explicit = req.query.region ?? req.get('x-region') ?? req.body?.region;
  if (isRegion(explicit)) return explicit;
  return countryOf(req) === 'NG' ? 'ng' : 'global';
};

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

// --- Payment webhooks ---
// Registered before the JSON parser (signature checks need the raw body) and
// before the rate limiter (processor retries must never be throttled).
// This is the ONLY way an ad goes live in production: the event must carry a
// valid processor signature, so a forged "I paid ₦1,000,000" request is rejected.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!payments.stripe) return res.status(404).end();

  let event;
  try {
    event = payments.stripe.constructWebhookEvent(req.body, req.headers['stripe-signature']);
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

// Paystack: HMAC-SHA512 signature over the raw body. We also check the amount
// and currency against our own record of the ad, and confirm the transaction
// with Paystack's API, before an ad goes live.
app.post('/api/webhooks/paystack', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!payments.paystack) return res.status(404).end();
  if (!payments.paystack.verifySignature(req.body, req.get('x-paystack-signature'))) {
    return res.status(401).send('Bad signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Bad JSON');
  }
  if (event.event !== 'charge.success') return res.json({ received: true });

  const reference = event.data?.reference;
  if (typeof reference !== 'string' || !UUID.test(reference)) return res.json({ received: true });
  try {
    const bid = await store.getBid(reference);
    if (!bid) return res.json({ received: true });
    const rules = game.rulesOf(bid.region);
    const expected = bid.amountCents + (bid.addonCents ?? 0);
    const tx = await payments.paystack.verifyTransaction(reference);
    if (tx.status !== 'success' || tx.amount !== expected || tx.currency !== rules.currency) {
      console.error(`[paystack] MISMATCH for ad ${reference}: got ${tx.status} ${tx.amount} ${tx.currency}, expected ${expected} ${rules.currency}`);
      return res.json({ received: true });
    }
    await game.settle(reference, reference);
  } catch (err) {
    console.error('[webhook] paystack settle failed; Paystack will retry', err);
    return res.status(500).end();
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
  app.use('/videos', express.static(LOCAL_DIRS.videos, { immutable: true, maxAge: '365d' }));
}

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    env: config.deployEnv,
    store: store.kind,
    storage: storage.kind,
    payments: Object.fromEntries(REGION_IDS.map((r) => [r, payments.modeFor(r)])),
    moderation: moderation.enabled,
    linkChecks: links.enabled,
    botCheck: turnstile.enabled,
  }),
);

// The region a visitor lands on: suggested from their country, overridable.
app.get('/api/geo', (req, res) => {
  res.json({ country: countryOf(req) || null, suggestedRegion: countryOf(req) === 'NG' ? 'ng' : 'global' });
});

app.get('/api/state', async (req, res, next) => {
  try {
    res.json(await game.getState(regionOf(req)));
  } catch (err) {
    next(err);
  }
});

app.get('/api/events', realtime.handler);


// --- Admin (only exists when ADMIN_TOKEN is set) ---
if (config.adminToken) {
  const admin = express.Router();
  admin.use(limiter(60, 'Too many admin requests.'), requireAdmin(config.adminToken), (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Revenue per region (each in its own currency) plus operational alerts.
  admin.get('/health', async (_req, res, next) => {
    try {
      const financials = await store.getFinancials();
      const balances = {};
      for (const region of REGION_IDS) {
        try {
          balances[region] = await payments.getBalance(region);
        } catch (err) {
          console.error(`[admin] ${region} processor balance unavailable`, err.message);
          balances[region] = null;
        }
      }
      res.json(assessHealth(financials, balances, config.regions, (r) => payments.modeFor(r)));
    } catch (err) {
      next(err);
    }
  });

  // Moderation queue: open reports grouped by ad, plus recent takedowns.
  admin.get('/reports', async (_req, res, next) => {
    try {
      const [open, removed] = await Promise.all([store.listReports(), store.listRemoved(30)]);
      res.json({ open, removed, autoHideThreshold: config.reports.autoHideThreshold });
    } catch (err) {
      next(err);
    }
  });

  const withBid = (handler) => async (req, res, next) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Ad not found.' });
      const bid = await store.getBid(req.params.id);
      if (!bid) return res.status(404).json({ error: 'Ad not found.' });
      await handler(req, res, bid);
    } catch (err) {
      next(err);
    }
  };

  // Take an ad down everywhere. purgeMedia also deletes the image file, which
  // is required for illegal content (hiding it is not enough).
  admin.post(
    '/bids/:id/remove',
    withBid(async (req, res, bid) => {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 3 || reason.length > 200) return res.status(400).json({ error: 'Give a reason (3-200 characters).' });
      await store.removeBid(bid.id, reason);
      let purged = false;
      if (req.body?.purgeMedia === true && (bid.imageUrl || bid.videoUrl)) {
        if (bid.imageUrl) purged = await storage.remove(bid.imageUrl);
        if (bid.videoUrl) purged = (await storage.remove(bid.videoUrl)) || purged;
        await store.clearImage(bid.id);
      }
      console.log(`[admin] removed ad ${bid.id} (${reason})${purged ? ' + media purged' : ''}`);
      realtime.broadcast('removed', { region: bid.region, bidId: bid.id });
      res.json({ ok: true, purged });
    }),
  );

  admin.post(
    '/bids/:id/restore',
    withBid(async (_req, res, bid) => {
      await store.restoreBid(bid.id);
      console.log(`[admin] restored ad ${bid.id}`);
      realtime.broadcast('removed', { region: bid.region, bidId: bid.id });
      res.json({ ok: true });
    }),
  );

  admin.post(
    '/bids/:id/dismiss',
    withBid(async (_req, res, bid) => {
      await store.dismissReports(bid.id);
      res.json({ ok: true });
    }),
  );

  // --- Video review: paid video ads wait here until a person approves them ---
  admin.get('/reviews', async (_req, res, next) => {
    try {
      const items = (await store.listReviews()).map((b) => ({
        id: b.id,
        region: b.region,
        board: b.board,
        boardName: b.board === 'throne' ? 'The Throne' : game.rulesOf(b.region).boards[b.board]?.name,
        name: b.name,
        tagline: b.tagline,
        targetUrl: b.targetUrl,
        imageUrl: b.imageUrl,
        videoUrl: b.videoUrl,
        amountCents: b.amountCents,
        addonCents: b.addonCents,
        currency: game.rulesOf(b.region).currency,
        days: b.days,
        reviewSince: b.reviewSince,
      }));
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  admin.post(
    '/bids/:id/approve',
    withBid(async (_req, res, bid) => {
      const result = await game.approveVideo(bid.id);
      console.log(`[admin] approved video ad ${bid.id}: ${result.status}`);
      res.json({ status: result.status });
    }),
  );

  admin.post(
    '/bids/:id/reject',
    withBid(async (req, res, bid) => {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 3 || reason.length > 200) return res.status(400).json({ error: 'Give a reason (3-200 characters).' });
      const result = await game.rejectVideo(bid.id, reason);
      console.log(`[admin] rejected video ad ${bid.id} (${reason}): ${result.status}`);
      res.json({ status: result.status });
    }),
  );

  app.use('/api/admin', admin);
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
    const region = regionOf(req);
    const page = await store.getLegends({ region, sort, limit, offset });
    res.json({ ...page, region, items: page.items.map(maskRemoved) });
  } catch (err) {
    next(err);
  }
});

// --- Kings of the Day ---
app.get('/api/crowns', async (req, res, next) => {
  try {
    const limit = Math.min(60, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const region = regionOf(req);
    res.json({ region, kings: await game.getDayKings(region, limit) });
  } catch (err) {
    next(err);
  }
});

// --- Outbound link interstitial ---
// The billboard never links straight out: it opens /go/:id, which shows the
// destination and a warning before the visitor continues.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A live (or archived) ad that hasn't been taken down.
const visibleBid = async (id) => {
  if (!UUID.test(id)) return { error: 404 };
  const bid = await store.getBid(id);
  if (!bid || bid.status !== 'won') return { error: 404 };
  if (bid.removedAt) return { error: 410 };
  return { bid };
};
const goError = (res, code) =>
  res.status(code).json({ error: code === 410 ? 'This ad was removed for breaking the rules.' : 'Ad not found.' });

app.get('/api/go/:id', async (req, res, next) => {
  try {
    const { bid, error } = await visibleBid(req.params.id);
    if (error) return goError(res, error);
    res.json({ name: bid.name, targetUrl: bid.targetUrl, host: new URL(bid.targetUrl).host });
  } catch (err) {
    next(err);
  }
});

const clickLimiter = limiter(20, 'Too many clicks. Try again in a minute.');

app.post('/api/go/:id', clickLimiter, async (req, res, next) => {
  try {
    const { bid, error } = await visibleBid(req.params.id);
    if (error) return goError(res, error);
    await store.recordClick(bid.id);
    res.json({ targetUrl: bid.targetUrl });
  } catch (err) {
    next(err);
  }
});

// --- Reports: any visitor can flag an ad, no account needed ---
const REPORT_REASONS = ['scam', 'adult', 'hate', 'violence', 'copyright', 'impersonation', 'other'];
const reportLimiter = limiter(5, 'Too many reports. Try again in a minute.');

app.post('/api/reports', reportLimiter, async (req, res, next) => {
  try {
    const { bidId, reason } = req.body ?? {};
    const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 500) : '';
    if (typeof bidId !== 'string' || !UUID.test(bidId)) return res.status(400).json({ error: 'Unknown ad.' });
    if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Pick a reason.' });

    // Only a salted hash of the IP is stored: enough to count each person once.
    const reporterHash = createHash('sha256').update(`${config.reports.ipHashSalt}:${req.ip}`).digest('hex');
    const result = await store.reportBid({
      bidId,
      reason,
      details: details || null,
      reporterHash,
      threshold: config.reports.autoHideThreshold,
    });
    if (result.status === 'missing') return res.status(404).json({ error: 'Ad not found.' });
    if (result.autoHidden) realtime.broadcast('removed', { region: (await store.getBid(bidId))?.region, bidId });
    // Duplicates get the same friendly answer: no need to tell people we counted them once.
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Submit a bid: validate -> link check -> moderate -> store image -> create payment ---
// Unpaid bids are cheap to send, so this is far stricter than the global limit.
const bidLimiter = limiter(config.bidsPerMinute, 'Too many bid attempts. Wait a minute and try again.');

// Prices in the region's own currency, for error messages.
// Naira is shown in whole naira, rounded UP: a ₦5,156.25 minimum reads ₦5,157,
// the smallest amount a buyer can actually pay.
const money = (cents, rules) =>
  new Intl.NumberFormat(rules.locale, { style: 'currency', currency: rules.currency, maximumFractionDigits: rules.currency === 'NGN' ? 0 : 2 }).format(
    rules.currency === 'NGN' ? Math.ceil(cents / 100) : cents / 100,
  );

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function validateBid(body, rules) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const tagline = typeof body.tagline === 'string' ? body.tagline.trim() : '';
  const amountCents = body.amountCents;
  // Sanity cap: 2,000x the starting price ($10,000 / ₦4,000,000 by default).
  const maxCents = rules.startingPriceCents * 2000;

  if (name.length < 1 || name.length > 40) return { error: 'Name must be 1-40 characters.' };
  if (tagline.length > 100) return { error: 'Tagline must be 100 characters or fewer.' };
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > maxCents) {
    return { error: 'Invalid bid amount.' };
  }

  let targetUrl;
  try {
    targetUrl = normalizeTargetUrl(body.targetUrl);
  } catch (err) {
    return { error: err.message };
  }

  // Map add-on: a business address, charged on top of the ad price.
  let address = null;
  let addonCents = 0;
  if (body.withMap === true) {
    address = typeof body.address === 'string' ? body.address.trim().replace(/\s+/g, ' ') : '';
    if (address.length < 5 || address.length > 160) return { error: 'Business address must be 5-160 characters.' };
    addonCents = rules.mapAddonCents;
  }

  // Video add-on: the token must be one this server signed at upload.
  let videoName = null;
  if (body.withVideo === true) {
    videoName = videos.nameFor(body.videoToken);
    if (!videoName) return { error: 'Upload your video again.' };
    if (!Array.isArray(body.videoFrames) || body.videoFrames.length < 1 || body.videoFrames.length > 4) {
      return { error: 'Video preview frames are missing. Choose the video again.' };
    }
    addonCents += rules.videoAddonCents;
  }
  return { name, tagline, targetUrl, amountCents, address, addonCents, videoName };
}

// Boards that can carry a video: the Throne, the Court and the Spotlight
// (Market stalls stay picture-only and cheap).
const videoAllowed = (board, rules) => board === 'throne' || !rules.boards[board]?.tier || rules.boards[board].tier === 'spotlight';

// Paystack needs the buyer's email to send a receipt. We hand it to Paystack
// and never store it.
function paymentEmail(req, region) {
  if (payments.modeFor(region) !== 'paystack') return null;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (email.length > 254 || !EMAIL.test(email)) throw new Reject(400, 'Enter a valid email for your payment receipt.');
  return email;
}

// Thrown inside the vetting pipeline to answer the client with a clean error.
class Reject extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Bot check first: it's free, and it stops card-testing scripts before they
// cost a moderation call or ever reach the payment processor.
async function requireHuman(req) {
  let human;
  try {
    human = await turnstile.verify(req.body.turnstileToken, req.ip);
  } catch (err) {
    console.error('[turnstile]', err);
    throw new Reject(503, "We couldn't run the bot check. Please try again in a moment.", { retryTurnstile: true });
  }
  if (!human) throw new Reject(403, 'Bot check failed or expired. Please try again.', { retryTurnstile: true });
}

// New ad content: image decode, link safety, AI moderation, then store the
// image. Everything happens before any payment exists, so a blocked ad is
// never charged.
async function vetAd(req, input) {
  let image = null;
  // Video ads: AI screens sampled frames now (blocked = never charged); a
  // person still reviews the whole video after payment.
  let frames = [];
  if (input.videoName) {
    try {
      frames = req.body.videoFrames.map((f) => decodeImage(f));
    } catch (err) {
      throw new Reject(400, err.message);
    }
  }
  if (req.body.image) {
    try {
      image = decodeImage(req.body.image);
    } catch (err) {
      throw new Reject(400, err.message);
    }
  }

  let linkVerdict;
  try {
    linkVerdict = await links.check(input.targetUrl);
  } catch (err) {
    console.error('[links]', err);
    throw new Reject(503, "We couldn't verify that link right now. Please try again in a moment.");
  }
  if (!linkVerdict.ok) throw new Reject(422, 'That link is flagged as unsafe (malware or phishing). You have not been charged.');

  const verdict = await moderation.check({
    text: [input.name, input.tagline, input.targetUrl, input.address].filter(Boolean).join('\n'),
    imageDataUrl: image?.dataUrl ?? frames[0]?.dataUrl,
  });
  if (!verdict.ok) throw new Reject(422, 'This ad breaks the content rules, so it was blocked. You have not been charged.');
  for (const frame of frames.slice(1)) {
    if (!(await moderation.check({ text: '', imageDataUrl: frame.dataUrl })).ok) {
      throw new Reject(422, 'This video breaks the content rules, so it was blocked. You have not been charged.');
    }
  }

  // A video's first frame doubles as its poster (shown while it loads).
  const poster = image ?? frames[0];
  return poster ? saveImage(poster, storage) : null;
}

const videoUrlOf = (input) => (input.videoName ? storage.urlFor('videos', input.videoName) : null);

// Creates the ad row and its payment. The owner code is returned exactly
// once; the browser keeps it to prove ownership later (e.g. relegation).
async function createPaidAd(res, { videoName: _videoName, ...fields }, description, email) {
  const owner = newOwnerToken();
  const bid = await store.createBid({ ...fields, ownerHash: owner.hash });
  // The charge is the ad price plus any add-on; amountCents alone is the bid.
  const chargeCents = bid.amountCents + (bid.addonCents ?? 0);
  const checkout = await payments.createIntent({ region: bid.region, bidId: bid.id, amountCents: chargeCents, description, email });
  res.status(201).json({
    bidId: bid.id,
    region: bid.region,
    board: bid.board,
    amountCents: chargeCents,
    addonCents: bid.addonCents ?? 0,
    currency: game.rulesOf(bid.region).currency,
    paymentsMode: payments.modeFor(bid.region),
    // Stripe: clientSecret. Paystack: accessCode (inline popup) + authorizationUrl (fallback redirect).
    ...checkout,
    ownerToken: owner.token,
    // Video ads go to a person for review after payment, then live.
    needsReview: Boolean(bid.videoUrl && !bid.relegatedFrom),
  });
}

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof Reject) return res.status(err.status).json({ error: err.message, ...err.extra });
    next(err);
  }
};

// --- Video upload (before the ad is created) ---
// Raw MP4/MOV body, capped in size and length; returns a signed token the bid
// form sends back. Strictly rate-limited: uploads cost storage.
const uploadLimiter = limiter(4, 'Too many uploads. Wait a minute and try again.');
app.post(
  '/api/uploads/video',
  uploadLimiter,
  express.raw({ type: ['video/mp4', 'video/quicktime'], limit: MAX_VIDEO_BYTES + 1024 }),
  handle(async (req, res) => {
    try {
      const { token, seconds } = await videos.save(req.body);
      res.status(201).json({ videoToken: token, seconds });
    } catch (err) {
      throw new Reject(400, err.message);
    }
  }),
);

// --- The Throne: auction ---
app.post(
  '/api/bids',
  bidLimiter,
  handle(async (req, res) => {
    const region = regionOf(req);
    const rules = game.rulesOf(region);
    const input = validateBid(req.body, rules);
    if (input.error) throw new Reject(400, input.error);
    const email = paymentEmail(req, region);
    await requireHuman(req);

    const minNext = await game.getMinNextBidCents(region);
    if (input.amountCents < minNext) {
      throw new Reject(409, `Bid must be at least ${money(minNext, rules)}. Amount updated.`, { minNextBidCents: minNext });
    }

    const imageUrl = await vetAd(req, input);
    await createPaidAd(
      res,
      { ...input, region, board: 'throne', imageUrl, videoUrl: videoUrlOf(input), shieldSeconds: game.shieldSecondsFor(region, input.amountCents) },
      `Throne bid by ${input.name}`,
      email,
    );
  }),
);

// --- Smaller boards: fixed-price bookings, guaranteed time ---
app.post(
  '/api/bookings',
  bidLimiter,
  handle(async (req, res) => {
    const board = req.body?.board;
    const days = req.body?.days;
    if (!BOARD_IDS.includes(board)) throw new Reject(400, 'Unknown board.');
    if (!BOOKING_DAYS.includes(days)) throw new Reject(400, 'Pick 1, 3 or 7 days.');
    const region = regionOf(req);
    const rules = game.rulesOf(region);
    const amountCents = bookingPriceCents(board, days, rules);
    // Spotlight and Market tiles are too small to show a map, so they never sell the add-on.
    const isStall = Boolean(rules.boards[board].tier);
    if (isStall && req.body?.withMap) throw new Reject(400, 'Spotlight spaces and Market stalls do not include a map.');
    if (req.body?.withVideo && !videoAllowed(board, rules)) throw new Reject(400, 'Market stalls take a picture, not a video.');
    const input = validateBid({ ...req.body, amountCents }, rules);
    if (input.error) throw new Reject(400, input.error);
    const email = paymentEmail(req, region);
    await requireHuman(req);

    const { tooFar } = await game.bookingStartEstimate(region, board);
    if (tooFar) throw new Reject(409, `This ${isStall ? 'stall' : 'board'} is booked more than ${rules.maxBookingAheadDays} days ahead. Try another one.`);

    const imageUrl = await vetAd(req, input);
    await createPaidAd(res, { ...input, region, board, days, imageUrl, videoUrl: videoUrlOf(input) }, `${rules.boards[board].name}: ${days} day(s) for ${input.name}`, email);
  }),
);

// --- Relegation: a dethroned king moves the same ad to the Prince Board ---
const ownerToken = (req) => req.get('x-owner-token') ?? req.body?.ownerToken;

app.get(
  '/api/relegations/:bidId',
  handle(async (req, res) => {
    if (!UUID.test(req.params.bidId)) throw new Reject(404, 'Ad not found.');
    const offer = await game.getRelegationOffer(req.params.bidId, ownerToken(req));
    if (!offer.eligible) return res.json({ eligible: false, reason: offer.reason });
    const { region, board, boardName, priceCents, currency, startsAt, expiresAt } = offer;
    res.json({ eligible: true, region, board, boardName, priceCents, currency, startsAt, expiresAt, needsEmail: payments.modeFor(region) === 'paystack' });
  }),
);

app.post(
  '/api/relegations',
  bidLimiter,
  handle(async (req, res) => {
    const fromBidId = req.body?.fromBidId;
    if (typeof fromBidId !== 'string' || !UUID.test(fromBidId)) throw new Reject(400, 'Unknown ad.');
    const offer = await game.getRelegationOffer(fromBidId, ownerToken(req));
    if (!offer.eligible) {
      const why = { 'not-owner': 'Only the dethroned advertiser can do this.', expired: 'This offer has expired.', used: 'You already used this offer.' };
      throw new Reject(403, why[offer.reason] ?? 'This ad is not eligible.');
    }
    // Same ad, already screened when it took the throne: no new upload or check.
    // It stays in its own region, paid in that region's currency.
    const { bid } = offer;
    const email = paymentEmail(req, bid.region);
    await createPaidAd(
      res,
      {
        region: bid.region,
        board: offer.board,
        days: 1,
        amountCents: offer.priceCents,
        relegatedFrom: bid.id,
        name: bid.name,
        tagline: bid.tagline,
        imageUrl: bid.imageUrl,
        videoUrl: bid.videoUrl ?? null,
        targetUrl: bid.targetUrl,
        // The map was paid for with the original ad: it travels with it, free.
        address: bid.addonCents > 0 ? bid.address : null,
      },
      `Relegation of ${bid.name} to ${offer.boardName}`,
      email,
    );
  }),
);

// --- My ads: private stats for the ads this browser bought ---
// The browser sends the owner codes it kept at purchase; only ads whose code
// matches are returned. No account, no email: the code is the proof.
app.post(
  '/api/my-ads',
  limiter(30, 'Too many requests. Slow down for a minute.'),
  handle(async (req, res) => {
    const list = Array.isArray(req.body?.ads) ? req.body.ads.slice(0, 50) : [];
    const items = [];
    for (const { bidId, token } of list) {
      if (typeof bidId !== 'string' || !UUID.test(bidId)) continue;
      const bid = await store.getBid(bidId);
      if (!bid || !isOwner(bid, token)) continue;
      const rules = game.rulesOf(bid.region);
      items.push({
        id: bid.id,
        region: bid.region,
        board: bid.board,
        boardName: bid.board === 'throne' ? 'The Throne' : rules.boards[bid.board]?.name ?? bid.board,
        name: bid.name,
        tagline: bid.tagline,
        imageUrl: bid.imageUrl,
        status: bid.status,
        removed: Boolean(bid.removedAt),
        paidCents: bid.amountCents + (bid.addonCents ?? 0),
        currency: rules.currency,
        views: bid.views ?? 0,
        clicks: bid.clicks ?? 0,
        createdAt: bid.createdAt,
        settledAt: bid.settledAt,
        startsAt: bid.startsAt,
        endsAt: bid.endsAt,
      });
    }
    res.json({ items });
  }),
);

app.get('/api/bids/:id/status', async (req, res, next) => {
  try {
    const bid = UUID.test(req.params.id) ? await store.getBid(req.params.id) : null;
    if (!bid) return res.status(404).json({ error: 'Bid not found.' });
    res.json({ status: bid.status, board: bid.board, startsAt: bid.startsAt, endsAt: bid.endsAt });
  } catch (err) {
    next(err);
  }
});

// Demo mode only: stands in for a cleared payment. Only works for ads in a
// region whose processor is "demo"; config.js refuses a production deploy with
// any demo region (only an explicit DEPLOY_ENV=staging test deploy may), so
// this route can never settle a real-money ad.
app.post('/api/bids/:id/demo-pay', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Bid not found.' });
    const pending = await store.getBid(req.params.id);
    if (!pending || payments.modeFor(pending.region) !== 'demo') return res.status(404).end();
    const result = await game.settle(req.params.id, `demo_${req.params.id}`);
    if (result.status === 'missing') return res.status(404).json({ error: 'Bid not found.' });
    const bid = await store.getBid(req.params.id);
    res.json({ status: bid.status, board: bid.board, startsAt: bid.startsAt, endsAt: bid.endsAt });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Crowns the King of the Day and retires a king at the end of his term, even
// when nobody is bidding.
let tickRunning = false;
setInterval(async () => {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await game.tick();
    await game.expireReviews();
  } catch (err) {
    console.error('[throne] tick failed', err);
  } finally {
    tickRunning = false;
  }
}, 1000).unref();

// Ad reach: credit live viewers to live ads every 15 s.
setInterval(() => {
  game.trackReach(realtime).catch((err) => console.error('[throne] reach tracking failed', err));
}, 15_000).unref();

if (config.hype.inlineWorker) {
  // Imported lazily: the renderer is heavy and most API boxes don't need it.
  const { startVideoWorker } = await import('./workers/videoWorker.js');
  startVideoWorker({ store, storage, siteLabel: new URL(config.siteUrl).host });
}

app.listen(config.port, () => {
  console.log(`Throne backend on http://localhost:${config.port}`);
  console.log(
    `  store=${store.kind} payments=${REGION_IDS.map((r) => `${r}:${payments.modeFor(r)}`).join(',')} moderation=${moderation.enabled ? 'on' : 'OFF'} linkChecks=${links.enabled ? 'on' : 'OFF'}`,
  );
});
