import 'dotenv/config';
import { randomBytes } from 'node:crypto';

const int = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
};

// Game mechanics shared by every region (times and percentages, no money).
const SHARED_RULES = {
  // An overthrow must beat the holder by the larger of minIncrement and this %.
  minRaisePct: int('MIN_RAISE_PCT', 10),
  // Time multiplier: every bid buys a shield. Bigger bid, longer shield.
  shieldBaseSeconds: int('SHIELD_BASE_SECONDS', 60),
  shieldMaxSeconds: int('SHIELD_MAX_SECONDS', 1800),
  // While shielded, overthrowing costs at least this % on top of the holder's price.
  shieldPremiumPct: int('SHIELD_PREMIUM_PCT', 25),
  // Term limit: a king unchallenged this long retires and the throne reopens
  // at the starting price, so it never goes stale.
  throneTermSeconds: int('THRONE_TERM_SECONDS', 7 * 86400),
  // How far ahead the booking queue may run.
  maxBookingAheadDays: int('MAX_BOOKING_AHEAD_DAYS', 60),
  // Relegation: a dethroned king may move the same ad to a smaller board for
  // one day at this discount, within this window.
  relegationDiscountPct: int('RELEGATION_DISCOUNT_PCT', 50),
  relegationWindowHours: int('RELEGATION_WINDOW_HOURS', 24),
  // Dethroned ads also show free in the "Recently dethroned" strip this long.
  recentlyDethronedHours: int('RECENTLY_DETHRONED_HOURS', 24),
  // King of the Day: whoever holds the throne at the daily cutoff is crowned.
  crownRoundSeconds: int('CROWN_ROUND_SECONDS', 86400),
  // Overtime (anti-sniping): a takeover in the final window adds time.
  crownOvertimeWindowSeconds: int('CROWN_OVERTIME_WINDOW_SECONDS', 60),
  crownExtensionSeconds: int('CROWN_EXTENSION_SECONDS', 12),
  crownMaxOvertimeSeconds: int('CROWN_MAX_OVERTIME_SECONDS', 600),
};

// A region's full rule set: shared mechanics + its own prices, each price
// overridable by env (e.g. NG_STARTING_PRICE_CENTS, NG_BOARD2_DAY_CENTS).
export const TERMS_VERSION = '2026-10-11';

function region(id, { name, currency, locale, envPrefix, defaults }) {
  const p = (key, fallback) => int(`${envPrefix}${key}`, fallback);
  return {
    id,
    name,
    currency,
    locale,
    rules: {
      ...SHARED_RULES,
      region: id,
      currency,
      locale,
      startingPriceCents: p('STARTING_PRICE_CENTS', defaults.startingPriceCents),
      minIncrementCents: p('MIN_INCREMENT_CENTS', defaults.minIncrementCents),
      shieldStepCents: p('SHIELD_STEP_CENTS', defaults.shieldStepCents),
      shieldSecondsPerStep: p('SHIELD_SECONDS_PER_STEP', defaults.shieldSecondsPerStep),
      // Map add-on: business address map on the ad. Charged on top of the bid
      // or booking price and never counted in throne price comparisons.
      mapAddonCents: p('MAP_ADDON_CENTS', defaults.mapAddonCents),
      // Video add-on: video ads cost more and always wait for a human review.
      videoAddonCents: p('VIDEO_ADDON_CENTS', defaults.videoAddonCents),
      // Every paid ad waits this long in the admin review queue before going
      // live (0 = straight live). Nigeria: 5 minutes, for ARCON pre-vetting.
      // Admin can approve sooner or reject (full refund). Videos always wait
      // for a person regardless.
      reviewHoldSeconds: p('REVIEW_HOLD_SECONDS', defaults.reviewHoldSeconds),
      // VAT included in the prices shown (percent; 0 = none shown).
      vatPct: p('VAT_PCT', defaults.vatPct),
      // The rules version a buyer must accept before paying (stored with the ad).
      // Change it whenever the Terms or Ad Policy change.
      termsVersion: TERMS_VERSION,
      crownCutoffHourUtc: p('CROWN_CUTOFF_HOUR_UTC', defaults.crownCutoffHourUtc),
      // Render a takeover video only for bids at or above this amount.
      hypeMinCents: p('HYPE_MIN_CENTS', defaults.hypeMinCents),
      bumpCents: defaults.bumpCents,
      sliderStepCents: defaults.sliderStepCents,
      // The smaller boards: fixed-price bookings with guaranteed time.
      boards: {
        b2: { name: process.env.BOARD2_NAME || 'Prince Board', dayPriceCents: p('BOARD2_DAY_CENTS', defaults.board2DayCents) },
        b3: { name: process.env.BOARD3_NAME || 'Herald Board', dayPriceCents: p('BOARD3_DAY_CENTS', defaults.board3DayCents) },
        // The Spotlight: ten featured spaces, between the Court and the Market.
        ...Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => i + 1).map((n) => [`p${n}`, { name: `Spotlight ${n}`, tier: 'spotlight', dayPriceCents: p('SPOTLIGHT_DAY_CENTS', defaults.spotlightDayCents) }]),
        ),
        // The Market: a wall of 12 small stalls at a price anyone can afford
        // (the Million Dollar Homepage idea, made live).
        ...Object.fromEntries(
          Array.from({ length: 12 }, (_, i) => i + 1).map((n) => [`m${n}`, { name: `Market Stall ${n}`, tier: 'market', dayPriceCents: p('MARKET_DAY_CENTS', defaults.marketDayCents) }]),
        ),
      },
    },
  };
}

const production = process.env.NODE_ENV === 'production';
// 'staging' = a public test deploy: real database and storage, but demo
// payments and optional safety keys are allowed. Never use it with real money.
const deployEnv = process.env.DEPLOY_ENV || (production ? 'production' : 'development');
if (!['production', 'staging', 'development'].includes(deployEnv)) {
  throw new Error('DEPLOY_ENV must be production, staging or development');
}

export const config = {
  port: int('PORT', 5000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:5000').replace(/\/$/, ''),
  // The public website (shown in hype videos), e.g. https://throne.example
  siteUrl: (process.env.SITE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, ''),
  // Supabase Storage bucket for ad images and videos (used when SUPABASE_URL is set).
  storageBucket: process.env.STORAGE_BUCKET || 'media',
  production,
  deployEnv,
  // Number of reverse proxies in front of the app (e.g. Cloudflare + host LB = 2).
  // Rate limits key on the client IP, so this must match the real topology.
  trustProxy: int('TRUST_PROXY', production ? 1 : 0),
  // Per-IP bid submissions per minute (each one can cost a moderation call).
  bidsPerMinute: int('BIDS_PER_MINUTE', 6),

  // Two separate thrones in one database: Global (USD) and Nigeria (NGN).
  // Each has its own currency, prices and daily cutoff; the game mechanics are
  // shared. All money is in minor units (cents / kobo).
  regions: {
    global: region('global', { name: 'Global', currency: 'USD', locale: 'en-US', envPrefix: '', defaults: {
      startingPriceCents: 500, // $5
      minIncrementCents: 200, // $2
      shieldStepCents: 100, // shield grows per extra $1 ...
      shieldSecondsPerStep: 30, // ... by 30 s
      board2DayCents: 300,
      board3DayCents: 150,
      marketDayCents: 50,
      videoAddonCents: 500,
      reviewHoldSeconds: 0,
      vatPct: 0,
      spotlightDayCents: 100,
      mapAddonCents: 200,
      crownCutoffHourUtc: 0, // midnight UTC
      hypeMinCents: 2000,
      bumpCents: [500, 2000], // quick "+5 / +20" buttons
      sliderStepCents: 50,
    } }),
    ng: region('ng', { name: 'Nigeria', currency: 'NGN', locale: 'en-NG', envPrefix: 'NG_', defaults: {
      startingPriceCents: 200000, // ₦2,000
      minIncrementCents: 50000, // ₦500
      shieldStepCents: 10000, // shield grows per extra ₦100 ...
      shieldSecondsPerStep: 30, // ... by 30 s
      board2DayCents: 150000, // ₦1,500
      board3DayCents: 80000, // ₦800
      marketDayCents: 30000, // ₦300
      videoAddonCents: 200000, // ₦2,000
      reviewHoldSeconds: 300, // 5-minute ARCON hold
      vatPct: 7.5, // prices include 7.5% VAT
      spotlightDayCents: 50000, // ₦500
      mapAddonCents: 100000, // ₦1,000
      crownCutoffHourUtc: 23, // midnight in Lagos (WAT = UTC+1)
      hypeMinCents: 1000000, // ₦10,000
      bumpCents: [100000, 500000], // "+₦1,000 / +₦5,000"
      sliderStepCents: 5000,
    } }),
  },

  hype: {
    // Run the video worker inside the API process (dev / single box).
    // In production run `npm run worker` as its own process instead.
    inlineWorker: process.env.HYPE_WORKER === 'inline',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // 'automatic' = 3DS when Radar or the bank asks; 'any' = always challenge cards.
    threeDS: process.env.STRIPE_3DS === 'any' ? 'any' : 'automatic',
  },
  paystack: {
    // One secret key does both: API calls and webhook signature checks.
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    // Overridable only so tests can point at a local fake Paystack; a
    // production deploy refuses anything but the real API (checked below).
    apiBase: (process.env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/$/, ''),
  },
  flutterwave: {
    // Flutterwave Standard (v3 hosted checkout): the customer pays on
    // Flutterwave's own page, so card details never touch our servers.
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
    // The "secret hash" you set in the Flutterwave dashboard (Settings ->
    // Webhooks); Flutterwave sends it back in the verif-hash header.
    webhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH || '',
    // Overridable only so tests can point at a local fake Flutterwave.
    apiBase: (process.env.FLUTTERWAVE_API_BASE || 'https://api.flutterwave.com').replace(/\/$/, ''),
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  webRiskApiKey: process.env.WEB_RISK_API_KEY || '',
  // Contact form (POST /api/contact + admin Inbox). Off for now: support is by
  // email. Set CONTACT_FORM=on to bring it back.
  contactForm: process.env.CONTACT_FORM === 'on',
  // Bearer token for /api/admin/*. Blank = admin endpoints disabled.
  adminToken: process.env.ADMIN_TOKEN || '',
  // Cloudflare Turnstile: a bot check inside the bid form. Blank = off (dev only).
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY || '',
  // Shared secret Cloudflare adds to every request (X-Origin-Secret). Blank = off.
  originSecret: process.env.ORIGIN_SECRET || '',

  reports: {
    // Distinct reporters needed to hide a live ad pending review (0 = never auto-hide).
    autoHideThreshold: int('REPORT_AUTOHIDE_THRESHOLD', 5),
    // Salt for hashing reporter IPs. Set it in production so the "one report per
    // person" rule survives restarts and is shared across API instances.
    ipHashSalt: process.env.IP_HASH_SALT || randomBytes(16).toString('hex'),
  },
};

if (config.adminToken && config.adminToken.length < 32) {
  throw new Error('ADMIN_TOKEN must be at least 32 characters (try: openssl rand -hex 32)');
}

// Which processor takes each region's payments: flutterwave | stripe | paystack | demo.
// Defaults: global → Flutterwave if keyed (else Stripe if keyed, else demo);
// ng → Paystack if keyed, else demo.
const PROCESSORS = ['flutterwave', 'stripe', 'paystack', 'demo'];
const pick = (name, fallback) => {
  const v = process.env[name] || fallback;
  if (!PROCESSORS.includes(v)) throw new Error(`${name} must be one of ${PROCESSORS.join(', ')}`);
  return v;
};
config.processors = {
  global: pick('PAYMENTS_GLOBAL', config.flutterwave.secretKey ? 'flutterwave' : config.stripe.secretKey ? 'stripe' : 'demo'),
  ng: pick('PAYMENTS_NG', config.paystack.secretKey ? 'paystack' : 'demo'),
};
for (const [region, processor] of Object.entries(config.processors)) {
  if (processor === 'stripe' && (!config.stripe.secretKey || !config.stripe.webhookSecret)) {
    throw new Error(`Region ${region} uses Stripe: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET`);
  }
  if (processor === 'paystack' && !config.paystack.secretKey) {
    throw new Error(`Region ${region} uses Paystack: set PAYSTACK_SECRET_KEY`);
  }
  if (processor === 'flutterwave' && (!config.flutterwave.secretKey || !config.flutterwave.webhookHash)) {
    throw new Error(`Region ${region} uses Flutterwave: set FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_WEBHOOK_HASH`);
  }
}

if (production && config.paystack.apiBase !== 'https://api.paystack.co') {
  throw new Error('PAYSTACK_API_BASE may only be overridden outside production (it exists for tests)');
}
if (production && config.flutterwave.apiBase !== 'https://api.flutterwave.com') {
  throw new Error('FLUTTERWAVE_API_BASE may only be overridden outside production (it exists for tests)');
}

export const REGION_IDS = Object.keys(config.regions);
export const rulesFor = (regionId) => config.regions[regionId]?.rules ?? config.regions.global.rules;

// Processors refuse tiny charges (Stripe: $0.50; Paystack: ₦100 is a safe
// floor). The cheapest thing we sell is a discounted relegation or a 1-day
// Herald booking.
const MIN_CHARGE = { USD: 50, NGN: 10000 };
for (const { id, rules: r } of Object.values(config.regions)) {
  const cheapest = Math.min(
    r.startingPriceCents,
    ...Object.values(r.boards).map((b) => b.dayPriceCents),
    // Relegation (half price) only ever goes to the Court boards.
    ...Object.values(r.boards).filter((b) => !b.tier).map((b) => Math.round((b.dayPriceCents * (100 - r.relegationDiscountPct)) / 100)),
  );
  if (cheapest < MIN_CHARGE[r.currency]) {
    throw new Error(`Region ${id}: every price must be at least ${MIN_CHARGE[r.currency]} minor units (processor minimum charge)`);
  }
}

// Never run real traffic with demo fallbacks. In particular this guarantees the
// unauthenticated demo-pay route can never exist in production (outside an
// explicit staging deploy).
// Each process checks only what it uses: the API needs everything, the video
// worker only needs the database and storage.
export function assertProductionConfig(role) {
  if (!config.production) return;
  // Even a test deploy needs a real database: the in-memory store would lose
  // everything on every restart and can't be shared with the video worker.
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error(`Deploy (${role}) requires SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY`);
  }
  if (role !== 'api') return;
  // Hashes reporter IPs and signs video upload tokens: must be stable across
  // restarts and instances, and secret. The Render blueprints generate it.
  if (!process.env.IP_HASH_SALT || process.env.IP_HASH_SALT.length < 16) {
    throw new Error('Deploy (api) requires IP_HASH_SALT (16+ random characters)');
  }

  const optional = [];
  for (const [region, processor] of Object.entries(config.processors)) {
    if (processor === 'demo') optional.push(`a real payment processor for region ${region} (PAYMENTS_${region.toUpperCase()})`);
  }
  if (!config.openaiApiKey) optional.push('OPENAI_API_KEY');
  if (!config.webRiskApiKey) optional.push('WEB_RISK_API_KEY');
  if (!config.turnstileSecret) optional.push('TURNSTILE_SECRET_KEY');
  if (!config.originSecret) optional.push('ORIGIN_SECRET');
  if (!optional.length) return;

  if (config.deployEnv === 'staging') {
    console.warn(`[config] STAGING deploy: running without ${optional.join(', ')}. Demo payments are ON. Not for real money.`);
    return;
  }
  throw new Error(`Production (api) requires: ${optional.join(', ')} (or set DEPLOY_ENV=staging for a test deploy)`);
}
