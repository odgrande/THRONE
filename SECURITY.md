# Security model

Zero signup + instant payments make this a target for card testers, scammers and trolls.
This maps each threat to where it is handled. **Code** items ship in this repo.
**Config** items are dashboard settings someone must turn on before launch.

## 1. Fake payments ("I paid $1000" injection)

| Defence | Where |
|---|---|
| The browser never writes ad state. Only `settle_bid()` changes the throne, and only the backend calls it | Code: `game.js`, `schema.sql` |
| Production settlement only happens from a signed processor webhook: Stripe (`constructEvent`), or Paystack (HMAC-SHA512 of the raw body, compared in constant time, **then** `GET /transaction/verify` must say `success` with the exact amount and currency we charged) | Code: `server.js`, `payments.js` |
| A signed webhook only settles an ad in **its own region**: `settle_bid()` refuses rules from another region, and every lock and update is scoped by region | Code: `schema.sql` |
| The buyer email Paystack requires is passed through and never stored | Code: `server.js` |
| The amount comes from our own `bids` row, never from the client or Stripe metadata | Code |
| RLS on, with no policies, on every table, and SQL functions revoked from `anon`/`authenticated`. A leaked anon key can't read or write anything | Code: `schema.sql` |
| `NODE_ENV=production` refuses to boot if any edition is on demo payments (unless `DEPLOY_ENV=staging`), and the demo-pay route only works for ads whose region is on demo | Code: `config.js`, `server.js` |
| Concurrent payments are serialized by a row lock. The loser is auto-refunded | Code: `schema.sql` |

## 2. Card testing and chargebacks

| Defence | Where |
|---|---|
| Wallet-first checkout (Apple Pay / Google Pay need biometrics). `VITE_ALLOW_CARDS=false` hides typed cards entirely | Code: `StripeCheckout.jsx` |
| 3D Secure on typed cards: `STRIPE_3DS=automatic` (default) or `any` (always challenge) | Code: `payments.js` |
| Cloudflare Turnstile bot check in the bid form, verified server-side before anything else runs (single-use tokens). Required in production | Code: `Turnstile.jsx`, `turnstile.js` |
| Bid endpoint limited to 6/min per IP, before any PaymentIntent exists | Code: `server.js` |
| Stripe Radar is on by default. Add these rules: | **Config: Stripe → Radar → Rules** |

Suggested Radar rules (test in "review" mode first):
```
Block if :card_count_for_ip_address_daily: > 3
Block if :total_charges_per_ip_address_hourly: > 10
Request 3D Secure if :risk_level: = 'elevated'
Block if :risk_level: = 'highest'
Block if :is_anonymous_ip: = true and :digital_wallet: = 'none'
```
Server-side wallet *enforcement* (rejecting typed cards even if a bot skips the UI) needs the
Stripe ConfirmationToken flow. That's a planned follow-up. Today the UI flag plus Radar rules cover it.

## 3. Malicious links, XSS and clickjacking

| Defence | Where |
|---|---|
| Only `http(s)` links. Blocks `javascript:`, `data:`, credentials-in-URL tricks, IP-literal and localhost hosts | Code: `linkSafety.js` |
| Google Web Risk check for malware/phishing before payment. Fails closed | Code: `linkSafety.js` (needs `WEB_RISK_API_KEY`) |
| Every ad click goes through the `/go/:id` warning page showing the real destination host | Code: `GoPage.jsx` |
| Outbound links use `rel="noopener noreferrer"`. React escapes all ad text, and no `dangerouslySetInnerHTML` is used | Code |
| Images are re-hosted (can't be swapped after moderation), magic-byte checked, no SVG, served with `CSP: sandbox` + `nosniff` | Code: `images.js`, `server.js` |
| Strict CSP: only our scripts, Stripe and Paystack (`js.paystack.co`, `checkout.paystack.com`). `frame-ancestors 'none'` + `X-Frame-Options: DENY` block clickjacking | Code: `vite.config.js` emits `dist/_headers` |
| Helmet security headers on the API | Code: `server.js` |

## 4. DoS on the auction

| Defence | Where |
|---|---|
| Global 300 req/min per IP on `/api`, 6/min on bids, 20/min on clicks | Code |
| Max 5 live streams per IP, 20k total | Code: `realtime.js` |
| Countdowns run in each browser from server timestamps, so flooding the server can't freeze the clock | Code |
| Cloudflare proxy (orange cloud) on frontend and API. WAF managed rules on. Rate-limit rule on `POST /api/bids`. Bot Fight Mode on. "Under Attack" mode for emergencies | **Config: Cloudflare** |
| Set `TRUST_PROXY` to the real hop count (Cloudflare → host = usually 2) so limits key on the visitor IP, not Cloudflare's | **Config: env** |
| Origin lock: the API rejects (403) any request without the `X-Origin-Secret` header that only Cloudflare adds, so `*.onrender.com` can't be used to bypass the WAF or spoof client IPs. Required in production | Code: `server.js`. **Config: Cloudflare Transform Rule** (DEPLOY.md step 6) |
| Exclude `/api/webhooks/stripe` and `/api/webhooks/paystack` from WAF challenges (processors can't solve them) | **Config: Cloudflare** |

## 5. Admin access

| Defence | Where |
|---|---|
| `/api/admin/*` only exists when `ADMIN_TOKEN` is set; 32-char minimum enforced at boot | Code: `config.js` |
| Constant-time token comparison (SHA-256 digests + `timingSafeEqual`), 30 req/min limit, `Cache-Control: no-store` | Code: `admin.js`, `server.js` |
| The `/admin` page is `noindex`, and the token lives in `sessionStorage` (gone when the tab closes) | Code: `AdminPage.jsx` |
| For extra safety, put `/admin` and `/api/admin/*` behind Cloudflare Access (free for small teams) so only your team's emails reach it | **Config: Cloudflare** |
| God mode: every admin action is written to `admin_log` (RLS on, no public access) with a before-snapshot. Undo only where it's safe (edit, end, takedown, restore, pause); refunds and permanent deletions are irreversible and need a reason + explicit confirmation. Log ids are validated | Code: `server.js`, `schema.sql` |
| Per-edition pause switch stops new ads (bids, bookings, relegations) in an emergency without touching the other edition | Code: `server.js` |

## 6. Reports and takedowns

| Defence | Where |
|---|---|
| A "Report ad" button on the billboard, the archive and the link-warning page. Anonymous, rate-limited (5/min/IP); only a salted IP hash is stored, and each person counts once per ad | Code: `ReportDialog.jsx`, `server.js`, `report_bid()` |
| Auto-hide: once `REPORT_AUTOHIDE_THRESHOLD` (default 5) different people report a live ad, it's hidden at once pending review. Restorable, so mass-reporting by rivals can be undone | Code: `report_bid()` |
| Admin → Moderation: review the unmasked ad, then take it down (with a reason), dismiss the reports, or restore it | Code: `ModerationQueue.jsx`, `/api/admin/bids/:id/*` |
| "Also delete the image file" permanently erases the file from storage, including the archive's copy. Use it for illegal content: hiding alone isn't enough | Code: `storage.remove()`, `clearImage()` |
| Removed ads are masked everywhere (billboard, battle log, archive, Kings of the Day, `/go/` returns 410) and are never rendered into hype videos | Code: `maskRemoved()`, `videoWorker.js` |

**Legal duty for some content:** child sexual abuse material must be reported to the authorities (in the US, NCMEC), not just deleted.
Write that procedure down before launch.

## 7. Video ads

| Defence | Where |
|---|---|
| Uploads: MP4/MOV only (file signature checked, not the extension), ≤ 20 MB (rejected by the parser with 413 before storage), ≤ 30 s (duration read from the file itself), 4/min and 15/day per IP | Code: `videos.js`, `server.js` |
| A bid references a video only by an HMAC-signed token (key: `IP_HASH_SALT`, required on every deploy), so nobody can attach an arbitrary or someone else's URL | Code: `videos.js` |
| AI screens three sampled frames + text + link **before** payment (blocked = never charged). The browser picks the frames, so this is only a first filter: | Code: `vetAd()` |
| **Every paid video waits in `review` and is never shown until a person approves it.** Reject = full refund + file deleted; unreviewed for 24 h = automatic refund | Code: `game.js`, `VideoReviews.jsx` |
| Unused uploads are deleted (2 h; 24 h for an unpaid checkout). Video URLs are unguessable UUIDs; local dev files get a sandbox CSP | Code: `videos.js`, `server.js` |
| CSP `media-src` allows only our API and media bucket | Code: `vite.config.js` |

## 8. Audience numbers and owner stats

| Defence | Where |
|---|---|
| Visitors are counted as a hash of their IP with a random salt replaced daily, kept in memory only; the database stores totals only (`daily_stats`, `bids.views`) | Code: `realtime.js`, `game.js` |
| The public performance numbers are cached 60 s per edition, so page-load floods can't become database floods | Code: `game.js` |
| `/my-ads` returns an ad only when the browser presents its 256-bit owner code (only the SHA-256 is stored); 30 req/min | Code: `server.js`, `owners.js` |
| Body-parser errors (oversized upload, malformed JSON) answer 4xx, never a server error | Code: `server.js` |

## 9. Contact form, rules acceptance, third parties

| Defence | Where |
|---|---|
| Contact/partner form: bot check, hidden honeypot, 3 messages/min per IP, topic whitelist, length caps; messages readable only in /admin and deleted after 90 days | Code: `server.js`, `ContactForm.jsx` |
| Every purchase requires acceptance of the current rules version; the version and time are stored on the ad | Code: `validateBid()`, `AcceptRules.jsx` |
| No third-party trackers: Stripe's script is lazy-loaded only for a Stripe checkout; no analytics or ad pixels anywhere (checked by the test suite) | Code: `PayStep.jsx` |

## 10. The Ads Game: coins, wallets and fair play

| Threat | Defence | Where |
|---|---|---|
| Stealing a wallet | 256-bit random key; only its SHA-256 is stored; restore attempts limited to 5/min per IP; the key is never in a URL | `arcade.js`, `arcadeRoutes.js` |
| Minting or double-spending coins | Coins change only in `apply_coins()` (row lock, never below zero, unique `(wallet, reason, ref)`); no public route takes an amount; coin packs credited only after the processor confirms amount + currency (`pay_coin_order()` is idempotent) | `schema.sql`, `server.js` webhooks |
| Bots / scripts solving the puzzle | Server-dealt shuffle per try (no shared solutions), server replays every move, server clock only, solves faster than `max(6 s, 140 ms × moves)` are not ranked and flagged for admins | `services/puzzle.js`, `arcade.js` |
| "Reroll until easy" | One open try per wallet; reload resumes the same board with the clock running; unfinished tries count as failed | `arcade.js` |
| Spamming tries / switching browser, PC or wallet | Reset timer after every try and a longer lock after 3 unfinished/failed tries in a row, checked per wallet **and per device**; daily free tries counted per wallet **and** device **and** network; extra tries cost coins and are capped | `arcade.js` `playStatus()` |
| Farming welcome coins with new wallets | Welcome coins only for the first 3 wallets per network and 1 per device per day; wallet creation is bot-checked (Turnstile) and limited to 5/min per IP | `arcade.js` `createWallet()` |
| Self-invites / invite farming | Invites from the inviter's own network or device don't count; rewards only after the friend's first real solve; banned wallets earn nothing | `arcade.js` `qualifyReferral()` |
| Cross-edition arbitrage | A wallet belongs to the edition it was made in; all its coins are spent there | `wallets.region` |
| Abusive names / ad cards | Names: whitelist pattern + political filter + AI moderation. Ad cards: same screening as paid ads; Nigeria cards held for review | `arcadeRoutes.js` |
| Moderation | Admin can ban wallets, adjust coins (with reason), void results (dethrones), reject cards; all logged | `/admin` → Game & wallets |
| Privacy | Network/device identifiers stored only as salted hashes and erased after 30 days | `purgeAttemptHashes()` |

## Known gaps before launch
- Device limits rely on a random id in browser storage plus the network: a determined cheater who clears storage AND changes network can get a few more free tries per day (still capped by cooldowns, coin costs and the bot check). Turn on Turnstile (`TURNSTILE_SECRET_KEY`) before launch.
- Have counsel check the coin/game terms (no cash value, no cash-out, skill game, invite rewards) for Nigeria (incl. the National Lottery Regulatory Commission's view of prize promotions) and the main Global markets.
- The legal pages are live. Clauses added on 11 October 2026 (owner, governing law, political ads, data rights, video ads, results disclaimer) should be checked by counsel. Check whether the company's CAC registration number (and registered office) must appear on the site.
- Unpaid `pending` bids and their images pile up. Add a cleanup job (delete `pending` older than 1 hour).
- The schema uses `create table if not exists`. Once a live database exists, later changes need real migrations (e.g. Supabase CLI migrations).
- Click counts and reach are best-effort: one person behind a VPN or several people behind one shared IP (common on Nigerian mobile networks) can skew them. The site describes how they are counted; don't sell them as audited figures.
- Video review needs a person on duty: set up a phone alert on `GET /api/admin/health` (the review queue) so videos don't wait or get auto-refunded.
