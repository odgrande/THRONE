# Project Throne

One global billboard. Anyone can take it by paying more than the current holder.
No signup: upload, link, pay, and you're live on every screen instantly.

## Run it locally (no API keys needed)

```bash
npm install && npm run install:all
npm run dev
```

Open http://localhost:5173 in **two browser windows** and bid in one; the other updates live.
With no keys set, the backend runs in demo mode: in-memory store, simulated payments, moderation off.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + Tailwind |
| Backend | Node 20+ / Express |
| Realtime | Server-Sent Events from the backend (`/api/events`) |
| Database | Supabase Postgres (`supabase/schema.sql`), in-memory fallback for dev |
| Payments | Stripe Payment Element (Apple Pay / Google Pay / Link / card) |
| Moderation | OpenAI `omni-moderation-latest` (text and image pixels) + Google Web Risk for links |
| Video | Remotion 4 (React → MP4), separate worker process |

## How a bid flows

1. `POST /api/bids` validates the input and checks the price is at least the current minimum.
2. The image is decoded (magic-byte check, 2 MB cap), then **moderated together with the text before any charge exists**.
3. The image is stored on our side (never hot-linked, so it can't be swapped after approval) and a `bids` row is created as `pending`.
4. If the bidder applies Throne Credits, the bid is split into credits plus a card charge (any card charge is at least $0.50, Stripe's minimum).
   A bid paid entirely in credits settles immediately. Otherwise a Stripe PaymentIntent is created for the card portion.
5. The Stripe webhook `payment_intent.succeeded` calls `settle_bid()`, which **row-locks the throne** and, in one transaction:
   - checks the price is still high enough, otherwise marks the bid outbid and **refunds the card portion in full**;
   - spends the credits, or marks the bid void and refunds it if they were already spent on another bid;
   - credits the dethroned king's dividend and moves the throne.
6. The takeover is broadcast to every viewer over SSE and, if big enough, queued for a hype video.

Webhooks are idempotent: a retried event for a settled bid is a no-op, so credits can never be double-spent or double-paid.

## Pricing

| Rule | Default | Env |
|---|---|---|
| Starting price (empty throne) | **$5.00** | `STARTING_PRICE_CENTS` |
| Minimum raise | **$2.00 or 10%, whichever is more** | `MIN_INCREMENT_CENTS`, `MIN_RAISE_PCT` |
| Shield | 60 s + 30 s per dollar above $5, capped at 30 min | `SHIELD_*` |
| Shield premium | While shielded, the raise is at least 25% | `SHIELD_PREMIUM_PCT` |
| Dividend | 15% of the new bid, as **Throne Credits** | `DIVIDEND_PCT` |
| Creator Fund | 5% of every bid, tracked for marketing | `CREATOR_FUND_PCT` |

| Holder paid | Shield | Overthrow while shielded | Overthrow after (open season) |
|---|---|---|---|
| $5 | 1 min | $7.00 | $7.00 |
| $20 | 8.5 min | $25.00 | $22.00 |
| $100 | 30 min (cap) | $125.00 | $110.00 |

A countdown and a draining bar show the shield live; the last 10 seconds flash red. Survive your shield and you're "Crowned" in the archive.
The ad never expires: it stays up until someone outbids it. The pricing rule lives in `backend/src/rules.js` and is mirrored in `settle_bid()`.

## King of the Day
The throne never closes, but every day has a champion. Whoever holds the throne when the daily clock hits zero
(midnight UTC by default) is crowned **King of the Day**: announced live, read aloud, and listed in the Kings of the Day hall on `/kings`.
- **Overtime (anti-sniping):** a takeover in the final 60 s adds 12 s to the clock, up to 10 min of overtime.
  The countdown band turns red and says "Overtime!".
- The crown is honor only. There's no prize money, which keeps it clear of lottery rules.
- A round is closed by the API every second (or by the next settlement, whichever comes first), inside a locked
  transaction (`tick_crown()`). A payment that clears after the clock hit zero can't steal the crown.
- All timings are env-tunable (`CROWN_*`).

## Practice mode (`/practice`)
A private, in-browser simulation with $500 of play money and computer rivals (off / slow / fast). It uses the real
pricing rules, shields and comeback credits, and sends nothing to the server.
Bots exist **only** here and are labelled as bots. Never add simulated bidders to the real throne: that's shill bidding.

## The four twists

| Twist | Status |
|---|---|
| 1. AI blind moderation | Done: `backend/src/services/moderation.js` |
| 2. Dividend | Done: dethroned kings earn **Throne Credits** (see below), not card refunds |
| 3. Live audio blast | Done: fanfare plus text-to-speech of the moderated tagline, opt-in "Sound on" (browsers block autoplay). Uploaded audio clips are deliberately left out until audio moderation exists |
| 4. Hype video machine | Done: Remotion renders a 6 s vertical MP4 per big takeover. **Auto-posting to TikTok/Reels/Shorts/X is not built yet** |

### Throne Credits
- No account: the browser keeps a random 256-bit wallet code, and the server stores only its SHA-256 hash.
  The bid form has "Back up code" and "Use code from another device" for moving credits between devices.
- Credits are spent on the next bid (fully or partly). Unspent credits are a liability on your books.
- **Cash-out is off** (`CASHOUT_ENABLED=false`). The UI says "from $20, coming soon". See the legal notes before turning it on.

### Hype videos
- Template: `backend/src/video/Takeover.jsx`. Three Bauhaus scenes: "The throne has fallen" (old king struck out), the new king and their ad, then the price slam and "Who's next?".
- Worker: `backend/src/workers/videoWorker.js` claims jobs from `hype_jobs`, bundles the template **once**, and renders H.264 MP4s into `backend/renders/` (served at `/renders`).
- Only takeovers of at least `HYPE_MIN_CENTS` (default $20) are rendered.
- Dev: `HYPE_WORKER=inline` renders inside the API process. Prod: run `npm run worker --prefix backend` as a separate process (it needs Supabase).
- Measured on a dev laptop: about **28 s per video**. The first run takes about 2.5 min extra (it bundles and downloads a headless Chrome).
- **Remotion license:** free for individuals and companies of up to 3 people. Larger teams need a company license (remotion.pro).
- Next step: upload renders to Storage/S3, then post through the official TikTok, YouTube, Instagram and X APIs (all need app review, so apply early).

### History of Kings (`/kings`)
Every time the throne changes hands, a Postgres trigger (`archive_deposed_king`) snapshots the deposed
ad into `throne_legends`: price, reign length, who overthrew them, and whether they survived their shield.
The page sorts by most recent, longest reign, or highest price, and shows live click counts.

## Admin treasury (`/admin`)
A private health view of credit liability vs. cash. Set `ADMIN_TOKEN` on the backend (32+ chars, e.g. `openssl rand -hex 32`),
then sign in at `/admin`. The token is kept for the browser tab only. With no token set, the endpoint doesn't exist.

| Metric | Meaning |
|---|---|
| Net card cash | Card revenue from won bids minus estimated Stripe fees (30¢ + 2.9%, refunded charges included) |
| Unspent credits | Total Throne Credits held across wallets: what you owe in kind |
| Coverage | Net cash − unspent credits − Creator Fund pledge |
| Credit ratio | Unspent credits ÷ net cash. **Watch at 15%, alert at 30%** (`backend/src/admin.js`) |
| Bid volume paid in credits | Credit-funded bids bring no cash but still mint dividends; this is the leak to watch |

It also shows the live Stripe balance (available + pending), stale unpaid bids and failed video renders, and refreshes every 30 s.
The data comes from `GET /api/admin/health` (Bearer token). That's the same endpoint to wire into an uptime monitor or Slack alert.

Simulated: in a 10-bid war where both rivals spend every credit on the next bid, 11% of bid volume was paid in credits, but unspent credits stayed at 4% of net cash. The rising minimum raise keeps new card money ahead of the credits.

## Security
See [SECURITY.md](SECURITY.md) for the full threat model, the Stripe Radar rules and the Cloudflare setup.

## Going to production

**Full step-by-step: [DEPLOY.md](DEPLOY.md)** (Cloudflare Pages + Render + Supabase, account order, every env var, Cloudflare rules, launch checklist). Summary:

1. Supabase: create a project, run `supabase/schema.sql`, and set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
2. Stripe: set `STRIPE_SECRET_KEY`, add a webhook to `https://<api>/api/webhooks/stripe` for `payment_intent.succeeded`, set `STRIPE_WEBHOOK_SECRET`, and put the publishable key in `frontend/.env`.
   Register your domain for Apple Pay in the Stripe dashboard or the Apple Pay button won't show.
3. OpenAI: set `OPENAI_API_KEY`. Google Cloud: enable the Web Risk API and set `WEB_RISK_API_KEY`.
4. `NODE_ENV=production` refuses to boot if any of the above is missing.
   Then do the **Config** items in SECURITY.md (Cloudflare, Radar, `TRUST_PROXY`).
5. Host the backend on a long-running Node host (Render, Railway, Fly). SSE does not work on serverless functions.
   Move uploads to Supabase Storage or S3 + CDN. For more than one instance, relay broadcasts through Redis pub/sub or Supabase Realtime.

## Open business and legal decisions (resolve before launch)

- **Fees.** At a $5 start Stripe takes about $0.45 (9%). At $50 it's about $1.75 (3.5%). Refunds (only for race-condition losers now) don't return the fee.
- **Credits are a real liability.** Every dethroned king earns 15% of the next bid in credits, so heavy bidding wars shift part of your revenue into credits that get spent instead of paid by card. Watch the outstanding credits total.
- **Cash-out of credits = stored value.** Letting people withdraw credits as money can make you a money transmitter or e-money issuer, and unclaimed balances can fall under unclaimed-property laws. It's off by default. Get a lawyer's sign-off and use Stripe Connect payouts (Connect handles the identity checks) before enabling it.
- **Creator Fund promises.** It's a marketing tracker, never paid to bidders, which removes the lottery problem. But if the site says the 5% "sponsors creators", you must actually spend it that way (consumer-protection rules), and the language should stay vague about amounts and recipients until you do.
- **No SEO backlinks.** Google requires paid links to be marked `sponsored`/`nofollow`. Selling followed links can get the whole site penalized. Every ad also routes through the `/go/` warning page. So the archive sells permanent *visibility* and bragging rights, not link juice. Don't market it as SEO.
- **Remotion license** (see Hype videos) if your company is more than 3 people.
- **Ad liability.** Add a report button and an admin takedown for legal notices (DMCA, trademark).
