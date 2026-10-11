# Project Throne

A live ad billboard. Anyone can take the big board by paying more than the current ad, or book a smaller board for a fixed time.
No signup: upload, link, pay, and you're live on every screen instantly. This is an **ads product**: there are no wallets, credits, dividends or payouts.

Two editions run side by side from one codebase and one database:

| Edition | Currency | Payments | Who lands on it |
|---|---|---|---|
| **Global** (`global`) | USD | **Flutterwave** (hosted checkout), Stripe optional | Everyone outside Nigeria |
| **Nigeria** (`ng`) | NGN | **Paystack**: card, bank transfer, USSD | Visitors from Nigeria (Cloudflare's `CF-IPCountry`) |

Each edition has its own throne, boards, King of the Day, archive, leaderboard and revenue. Amounts are never compared across currencies.
Visitors can switch with the 🌍 $ / 🇳🇬 ₦ toggle in the header, and the choice is remembered.

## Run it locally (no API keys needed)

```bash
npm install && npm run install:all
npm run dev
```

Open http://localhost:5173 in **two browser windows** and bid in one; the other updates live. Add `?region=ng` to see the Naira edition.
With no keys set, the backend runs in demo mode: in-memory store, simulated payments, moderation off.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + Tailwind, Bauhaus design system, GSAP |
| Backend | Node 20+ / Express |
| Realtime | Server-Sent Events (`/api/events`), filtered per edition in the browser |
| Database | Supabase Postgres (`supabase/schema.sql`), in-memory fallback for dev |
| Payments | Paystack inline checkout (NG), Stripe Payment Element (global), chosen per region by `PAYMENTS_NG` / `PAYMENTS_GLOBAL` |
| Moderation | OpenAI `omni-moderation-latest` (text and image pixels) + Google Web Risk for links |
| Video | Remotion 4 (React → MP4), separate worker process |

## The boards

- **The Throne (auction).** Pay at least the minimum and your ad replaces the king instantly. Unchallenged kings retire after **7 days**.
- **The Court: Prince Board (b2) and Herald Board (b3).** Fixed-price bookings for 1, 3 or 7 days (3 days = 2.5×, 7 days = 5× a day). Guaranteed time: nobody can knock you off.
- **The Spotlight (p1–p10).** Ten featured spaces, bigger than stalls and cheaper than the Court.
- **The Market (m1–m12).** Twelve small, low-cost stalls for tight budgets: the Million Dollar Homepage idea, made live. Picture only, no map.
- **Relegation.** A dethroned king can move the same ad to whichever small board frees up first, for 1 day at **50% off**, within 24 hours.
- **Recently dethroned.** Every fallen king gets 24 hours in a free strip on the home page.
- **King of the Day.** Whoever holds the throne when the daily clock hits zero is crowned (midnight UTC for global, **midnight Lagos time** for Nigeria). A takeover in the final 60 s adds 12 s of overtime, up to 10 min. The title is honour only, with no prize.

## Pricing (defaults, all env-tunable)

| Rule | Global | Nigeria | Env (NG uses the `NG_` prefix) |
|---|---|---|---|
| Throne starting price | $5 | ₦2,000 | `STARTING_PRICE_CENTS` |
| Minimum raise | $2 or 10%, whichever is more | ₦500 or 10% | `MIN_INCREMENT_CENTS`, `MIN_RAISE_PCT` |
| Shield | 60 s + 30 s per $1 above start, max 30 min | 60 s + 30 s per ₦100 | `SHIELD_*` |
| Shield premium | While shielded, the raise is at least 25% | same | `SHIELD_PREMIUM_PCT` |
| Prince Board / day | $3 | ₦1,500 | `BOARD2_DAY_CENTS` |
| Herald Board / day | $1.50 | ₦800 | `BOARD3_DAY_CENTS` |
| Spotlight / day | $1 | ₦500 | `SPOTLIGHT_DAY_CENTS` |
| Market stall / day | $0.50 | ₦300 | `MARKET_DAY_CENTS` |
| Map add-on (Throne, Court) | $2 | ₦1,000 | `MAP_ADDON_CENTS` |
| Video add-on (Throne, Court, Spotlight) | $5 | ₦2,000 | `VIDEO_ADDON_CENTS` |

Amounts are integers in minor units (cents / kobo). The rules live in `backend/src/rules.js` and `backend/src/config.js`, and `settle_bid()` re-checks them in SQL.

## How a payment flows

1. `POST /api/bids` (or `/api/bookings`, `/api/relegations`) validates the ad and price for the visitor's edition.
2. The image is decoded (magic-byte check, 2 MB cap) and **moderated together with the text before any charge exists**. Links are checked with Web Risk.
3. The image is re-hosted on our side, and a `pending` row is created with its `region`.
4. The edition's processor is asked for a checkout:
   - **Paystack:** `transaction/initialize` with the amount in kobo, our ad id as the `reference`, and the buyer's email (Paystack needs it for the receipt; **we don't store it**). The browser opens Paystack's popup, with a link to Paystack's own page if popups are blocked.
   - **Stripe:** a PaymentIntent with the ad id in metadata.
5. The webhook settles it:
   - **Paystack:** HMAC-SHA512 signature check, then `GET /transaction/verify/:ref`; the amount and currency must match what we charged.
   - **Stripe:** signature check.
6. `settle_bid()` **row-locks that region's throne or board**. If another payment won the race, the loser is **refunded in full** (bid + map fee).
7. The change is broadcast over SSE, and big takeovers are queued for a hype video.

Webhooks are idempotent: a retried event for a settled ad is a no-op.

## Video ads (reviewed by a person)
- MP4/MOV, up to 30 s and 20 MB, on the Throne, the Court and the Spotlight, for the video add-on fee.
- The server checks the file signature and reads the real duration; uploads return a signed token (a bid can only reference a file this server stored). 15 uploads per IP per day; videos never used by a paid ad are deleted (2 h, or 24 h for an unpaid checkout).
- Before payment, AI screens three sampled frames with the text and link. **After payment the ad waits in "review" and is not shown**. Admin → Video review: approve (it settles normally; a throne bid outbid meanwhile is refunded), or reject (full refund, file deleted). Anything not reviewed within 24 h is refunded automatically.

## Ad performance (real numbers, before and after paying)
- **Reach:** distinct people on the site while an ad was live, counted every 15 s from live connections. A visitor is a daily-salted hash of their IP, held in memory only; the database stores totals.
- **Clicks:** visits through the `/go/` link-safety page.
- **Before paying:** the bid form and booking dialog show the edition's last 7 days (visitors, clicks on ads, a throne ad's typical reach). Hidden until there's traffic; never padded.
- **Public:** the live throne and History of Kings show reach and clicks. **Private:** `/my-ads` lists the ads bought from this browser (owner codes kept 90 days) with their results.

## Languages
The Nigeria edition has a language picker: English, **Nigerian Pidgin, Yorùbá, Hausa, Igbo**. The interface strings are in `frontend/src/lib/i18n.js`. Missing keys fall back to English, and `<html lang>` is set.
- The four translations were reviewed by a native speaker (October 2026) and are live. Have any new or changed string checked the same way.
- Ads appear exactly as the advertiser wrote them. The legal pages stay in English.

## Add-ons and site experience
- **Map add-on:** the advertiser adds a business address, and the ad shows a map card with **Directions** (Google Maps). Ads without it show a faded, locked map. The Embed key (`VITE_GOOGLE_MAPS_EMBED_KEY`) should be restricted to your domain. The map only loads on click. The fee never counts toward throne bids, and refunds return it.
- **Billboard first:** the live ad is the first thing on screen (phones too). On desktop the bid form scrolls inside its own panel, so the billboard stays visible while someone fills it in.
- **Billboard:** the frame colour changes with each king, a ring counts down the shield, and a bar shows Total pool / Highest bid / Takeovers.
- **Businesses we've helped:** live counts, a **Top advertisers** leaderboard (spend per business, per edition), and a logo wall of **labelled example brands**. Add real logos only with written permission (`frontend/src/data/showcase.js`).
- **Sound:** Afro-groove background music is **on by default**: it starts at the visitor's first tap or click (browsers forbid sound before that), pauses whenever the tab is hidden, resumes when they return, and can be stopped any time (header on desktop, floating button on phones; the choice is remembered). Effects and voice announcements stay off until switched on.
- **Light/dark:** light by default; dark only when the visitor picks it.
- **Cookie notice:** small. No tracking cookies are set. If analytics are ever added, it must become an opt-in.

## Practice mode (`/practice`)
A private in-browser simulation with play money ($500 or ₦200,000) and computer rivals. It sends nothing to the server.
Bots exist **only** here and are labelled. Never add simulated bidders to the real throne: that's shill bidding.

## History of Kings (`/kings`)
A Postgres trigger (`archive_deposed_king`) snapshots every deposed ad into `throne_legends` per edition: price, reign, who toppled them, and whether they survived the shield.

## Admin (`/admin`)
Set `ADMIN_TOKEN` on the backend (32+ chars, `openssl rand -hex 32`), then sign in at `/admin`. Tabs: Treasury, Moderation, **Video review**, **God mode**.
- **God mode:** search every ad; edit its words or link, end a reign or booking now, take it down or restore it, refund it, and pause new ads per edition. Every action goes to an activity log with a before-snapshot; edits, endings (unless someone has taken the throne since), takedowns, restores and pauses have **Undo**. Refunds and permanent media deletion are irreversible and need a reason and an explicit confirmation.
- **Treasury:** one block per edition, in its own currency: revenue (throne / boards / map add-ons), estimated processor fees (Paystack: 1.5% + ₦100 over ₦2,500, capped at ₦2,000; Stripe: 30¢ + 2.9%), refunds, and the live processor balance.
- Also shows stale unpaid ads and failed video renders.
- **Moderation:** the report queue, with takedown (optionally deleting the image), dismiss and restore. Five distinct reporters auto-hide a live ad pending review.
- The data comes from `GET /api/admin/health` (Bearer token), which you can also point an uptime monitor at.

## Pages for buyers, partners and help
- **`/safety`**: our security level (live status of each anti-fraud check), how we stop scams, what we never store, how the site is protected, and safety tips.
- **`/faq`**: plain answers on buying, refunds, review, results, safety and data.
- **`/contact`**: a protected form (bot check, honeypot, 3/min rate limit, size caps) plus email; `?topic=` preselects a topic.
- **`/partners`**: agencies, sponsors, communities and investors; live numbers only once there is traffic; not an offer of securities.
- Messages land in **Admin → Inbox** (reply by email, mark answered, delete) and are deleted automatically after 90 days.
- Every page except the home page loads on demand, which keeps the first load small on mobile data. Stripe's script loads only if a Stripe checkout opens.

## Accepting the rules (recorded)
Before paying, every buyer sees a short "what you are buying" list (age, Ad Policy, outbid risk or guaranteed days, review/refunds, no promised sales, removal) and must tick a box. The server refuses any ad without the current rules version (`TERMS_VERSION` in `backend/src/config.js`, bump it when the Terms change) and saves the version and time on the ad (`bids.terms_version`, `terms_accepted_at`), visible in God mode and My ads.

## Nigeria compliance switches
- **Review hold (ARCON):** `NG_REVIEW_HOLD_SECONDS` (default 300). Every paid Nigerian ad waits in the review queue, then goes live unless rejected (full refund).
- **Political and advocacy ads** are blocked automatically before payment (`backend/src/services/political.js`), and can be reported.
- **VAT:** `NG_VAT_PCT` (default 7.5): Naira prices include VAT; the VAT share is shown in the treasury.

## Notices
- A one-time notice (with the cookie line): every ad is a paid placement by an independent advertiser; Throne isn't affiliated with or endorsing any of them; never send money to anyone claiming to be Throne. The same text is in the footer, and a short version sits under the logo on the preloader.
- Every ad unit (throne, Court, Spotlight, Market, Recently dethroned, archive) is labelled **Paid ad** and has **Report**.

## Legal (`/legal`)
Terms, Ad Policy, Privacy Policy and Copyright & Takedowns. They have been reviewed by counsel and are live (last updated 10 October 2026). Contact: **therone@gmail.com**.
Throne is owned and operated by **Odgrande NG Limited** (online business, contact by email). Terms are governed by Nigerian law, with Global-edition consumers keeping their own country's non-excludable consumer protections. **Political ads are not allowed** (reasons in the Ad Policy; visitors can report them). Data rights follow the NDPA 2023 and, for users there, the GDPR. Socials: **@theroneads** on X, TikTok, Instagram, LinkedIn and Facebook.
If a feature changes, update the matching section and `LAST_UPDATED`.

## Hype videos
Remotion renders a 6 s vertical MP4 per big takeover (≥ `HYPE_MIN_CENTS`, per edition, in its currency): `backend/src/video/Takeover.jsx` and `backend/src/workers/videoWorker.js`.
- Dev: `HYPE_WORKER=inline`. Prod: run the separate worker.
- Remotion is free for companies of up to 3 people.
- Auto-posting to TikTok/Reels/Shorts/X is not built yet.

## Security
See [SECURITY.md](SECURITY.md).

## Deploying
- Free staging: [DEPLOY-STAGING.md](DEPLOY-STAGING.md).
- Production: [DEPLOY.md](DEPLOY.md).
- `NODE_ENV=production` refuses to boot with demo payments in any edition, unless `DEPLOY_ENV=staging`.

## Business notes
- **Fees.** Paystack takes ₦30 on a ₦2,000 throne bid (1.5%), ₦137.50 on ₦2,500 (5.5%, the ₦100 flat fee starts there) and ₦1,600 on ₦100,000 (1.6%). Refunds to race losers don't return the fee.
- **No SEO backlinks.** Every ad routes through the `/go/` warning page. Sell visibility, not link juice.
