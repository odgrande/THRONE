import 'dotenv/config';
import { randomBytes } from 'node:crypto';

const int = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
};

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

  rules: {
    startingPriceCents: int('STARTING_PRICE_CENTS', 500),
    // An overthrow must beat the holder by the larger of these two.
    minIncrementCents: int('MIN_INCREMENT_CENTS', 200),
    minRaisePct: int('MIN_RAISE_PCT', 10),
    // Time multiplier: every bid buys a shield. Bigger bid, longer shield.
    shieldBaseSeconds: int('SHIELD_BASE_SECONDS', 60),
    shieldSecondsPerDollar: int('SHIELD_SECONDS_PER_DOLLAR', 30),
    shieldMaxSeconds: int('SHIELD_MAX_SECONDS', 1800),
    // While shielded, overthrowing costs at least this % on top of the holder's price.
    shieldPremiumPct: int('SHIELD_PREMIUM_PCT', 25),
    // Term limit: a king unchallenged this long retires and the throne reopens
    // at the starting price, so it never goes stale.
    throneTermSeconds: int('THRONE_TERM_SECONDS', 7 * 86400),

    // The smaller boards: fixed-price bookings with guaranteed time.
    boards: {
      b2: { name: process.env.BOARD2_NAME || 'Prince Board', dayPriceCents: int('BOARD2_DAY_CENTS', 300) },
      b3: { name: process.env.BOARD3_NAME || 'Herald Board', dayPriceCents: int('BOARD3_DAY_CENTS', 150) },
    },
    // How far ahead the booking queue may run.
    maxBookingAheadDays: int('MAX_BOOKING_AHEAD_DAYS', 60),
    // Relegation: a dethroned king may move the same ad to the Prince Board
    // for one day at this discount, within this window.
    relegationDiscountPct: int('RELEGATION_DISCOUNT_PCT', 50),
    relegationWindowHours: int('RELEGATION_WINDOW_HOURS', 24),
    // Dethroned ads also show free in the "Recently dethroned" strip this long.
    recentlyDethronedHours: int('RECENTLY_DETHRONED_HOURS', 24),
    // Map add-on: business address map on the ad. Charged on top of the bid or
    // booking price and never counted in throne price comparisons.
    mapAddonCents: int('MAP_ADDON_CENTS', 200),

    // King of the Day: whoever holds the throne at the daily cutoff is crowned.
    // Rounds are crownRoundSeconds long, ending at crownCutoffHourUtc.
    crownRoundSeconds: int('CROWN_ROUND_SECONDS', 86400),
    crownCutoffHourUtc: int('CROWN_CUTOFF_HOUR_UTC', 0),
    // Overtime (anti-sniping): a takeover in the final window adds time.
    crownOvertimeWindowSeconds: int('CROWN_OVERTIME_WINDOW_SECONDS', 60),
    crownExtensionSeconds: int('CROWN_EXTENSION_SECONDS', 12),
    crownMaxOvertimeSeconds: int('CROWN_MAX_OVERTIME_SECONDS', 600),
  },

  hype: {
    // Render a takeover video only for bids at or above this amount.
    minCents: int('HYPE_MIN_CENTS', 2000),
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
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  webRiskApiKey: process.env.WEB_RISK_API_KEY || '',
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

// Stripe will not charge less than $0.50 USD; the cheapest thing we sell is a
// discounted relegation or a 1-day Herald booking.
{
  const r = config.rules;
  const cheapest = Math.min(
    r.startingPriceCents,
    ...Object.values(r.boards).map((b) => Math.round((b.dayPriceCents * (100 - r.relegationDiscountPct)) / 100)),
  );
  if (cheapest < 50) throw new Error('Every price must be at least 50 cents (Stripe minimum charge)');
}

// Never run real traffic with demo fallbacks. In particular this guarantees the
// unauthenticated demo-pay route can never exist in production.
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

  const optional = [];
  if (!config.stripe.secretKey || !config.stripe.webhookSecret) optional.push('STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET');
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
