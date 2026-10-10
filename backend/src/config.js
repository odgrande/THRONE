import 'dotenv/config';

const int = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
};

const production = process.env.NODE_ENV === 'production';

export const config = {
  port: int('PORT', 5000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:5000').replace(/\/$/, ''),
  // The public website (shown in hype videos), e.g. https://throne.example
  siteUrl: (process.env.SITE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, ''),
  // Supabase Storage bucket for ad images and videos (used when SUPABASE_URL is set).
  storageBucket: process.env.STORAGE_BUCKET || 'media',
  production,
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
    // Dethroned holders earn this % of the new bid as Throne Credits.
    dividendPct: int('DIVIDEND_PCT', 15),
    // Earmarked for creator sponsorships / traffic buys. Never paid to bidders.
    creatorFundPct: int('CREATOR_FUND_PCT', 5),
    // King of the Day: whoever holds the throne at the daily cutoff is crowned.
    // Rounds are crownRoundSeconds long, ending at crownCutoffHourUtc.
    crownRoundSeconds: int('CROWN_ROUND_SECONDS', 86400),
    crownCutoffHourUtc: int('CROWN_CUTOFF_HOUR_UTC', 0),
    // Overtime (anti-sniping): a takeover in the final window adds time.
    crownOvertimeWindowSeconds: int('CROWN_OVERTIME_WINDOW_SECONDS', 60),
    crownExtensionSeconds: int('CROWN_EXTENSION_SECONDS', 12),
    crownMaxOvertimeSeconds: int('CROWN_MAX_OVERTIME_SECONDS', 600),
  },

  credits: {
    // Cash-out of Throne Credits turns them into redeemable stored value,
    // which can trigger money-transmitter rules. Off until counsel signs off.
    cashoutEnabled: process.env.CASHOUT_ENABLED === 'true',
    cashoutMinCents: int('CASHOUT_MIN_CENTS', 2000),
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
};

if (config.adminToken && config.adminToken.length < 32) {
  throw new Error('ADMIN_TOKEN must be at least 32 characters (try: openssl rand -hex 32)');
}

// Stripe will not charge less than $0.50 USD.
if (config.rules.startingPriceCents < 50) {
  throw new Error('STARTING_PRICE_CENTS must be at least 50 (Stripe minimum charge)');
}

// Never run real traffic with demo fallbacks. In particular this guarantees the
// unauthenticated demo-pay route can never exist in production.
// Each process checks only what it uses: the API needs everything, the video
// worker only needs the database and storage.
export function assertProductionConfig(role) {
  if (!config.production) return;
  const missing = [];
  if (!config.supabase.url || !config.supabase.serviceRoleKey) missing.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  if (role === 'api') {
    if (!config.stripe.secretKey || !config.stripe.webhookSecret) missing.push('STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET');
    if (!config.openaiApiKey) missing.push('OPENAI_API_KEY');
    if (!config.webRiskApiKey) missing.push('WEB_RISK_API_KEY');
    if (!config.turnstileSecret) missing.push('TURNSTILE_SECRET_KEY');
    if (!config.originSecret) missing.push('ORIGIN_SECRET');
  }
  if (missing.length) throw new Error(`Production (${role}) requires: ${missing.join(', ')}`);
}
