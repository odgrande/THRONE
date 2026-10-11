# Launch checklist: staging → production

One ordered list from zero to live. Tick each box before moving on: later steps need values from earlier ones.
Details for each step: **DEPLOY-STAGING.md** (phase B) and **DEPLOY.md** (phase C).

**Golden rules**
- Secret keys go **only** into the Render / Cloudflare / Supabase dashboards. Never into chat, email, screenshots or the code.
- Safe to share with your developer: URLs, the Turnstile *site* key, the Supabase Project URL, and screenshots of errors (with keys hidden).
- The Paystack/Flutterwave test keys pasted in chat earlier are burned: **regenerate them** before using them anywhere (step A3).

Who does what: **You** = a dashboard click only you can do. **Dev** = your developer (or Claude), from the repo or a browser.

---

## A. Before you start (once)

- [ ] **A1. Accounts (You):** GitHub (done: `odgrande/THRONE`), Supabase, Render, Cloudflare, Paystack (business verified / KYC), Flutterwave (business verified), OpenAI, Google Cloud (billing on, for Web Risk).
- [ ] **A2. Domain (You):** buy it, add it to Cloudflare (Add a site), and point its nameservers at Cloudflare. Not needed for staging; needed for production.
- [ ] **A3. Fresh keys (You):** Paystack → Settings → API Keys → **regenerate** the test secret key. Flutterwave → Settings → API Keys → **regenerate** the test keys, and choose a **new** webhook hash. Keep them in a password manager.
- [ ] **A4. Lawyer (You):** send counsel the Terms section *Coins & the Throne Race*, the Privacy additions (game wallet), and ask about ARCON scope, NDPC registration, and how Nigeria's National Lottery Regulatory Commission views free prize games. Production can wait for this; staging can't hurt.

## B. Staging (free, public test site, no real money)

- [ ] **B1. Supabase staging (You):** new project `throne-staging`, region **Central EU (Frankfurt)**. SQL Editor → paste all of `supabase/schema.sql` → Run → "Success". Copy the **Project URL** (shareable) and the **service_role** key (SECRET).
- [ ] **B2. Render staging API (You):** New → Blueprint → repo `odgrande/THRONE` (uses `render.yaml`: free plan, `DEPLOY_ENV=staging`, game mode, coin packs off). Fill in:
  | Variable | Value |
  |---|---|
  | `CORS_ORIGIN`, `SITE_URL` | your Pages URL from B3, e.g. `https://throne-test.pages.dev` |
  | `SUPABASE_URL` | Project URL (B1) |
  | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (B1, SECRET) |

  Then Environment → copy **`ADMIN_TOKEN`** to your password manager.
- [ ] **B3. Cloudflare Pages staging (You):** Workers & Pages → Pages → connect the repo. Root `frontend`, build `npm run build`, output `dist`. Variables: `NODE_VERSION=22`, `VITE_API_URL` = Render URL, `VITE_MEDIA_ORIGIN` = Supabase Project URL, `VITE_SITE_URL` = the Pages URL.
- [ ] **B4. Optional now, required later (You):** Turnstile widget for the Pages hostname (site key → Pages `VITE_TURNSTILE_SITE_KEY`, secret → Render `TURNSTILE_SECRET_KEY`); Paystack **test** (`PAYMENTS_NG=paystack`, `PAYSTACK_SECRET_KEY`, test webhook URL `https://<render-url>/api/webhooks/paystack`); Flutterwave **test** (`PAYMENTS_GLOBAL=flutterwave`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, webhook URL `https://<render-url>/api/webhooks/flutterwave`).

### B5. Staging checks (Dev, about 30 minutes; send the two URLs)
Wake the API first by opening `https://<render-url>/api/health` (free tier sleeps; the first load takes ~1 minute).
- [ ] Health shows `"env":"staging"`, `"store":"supabase"`, `"storage":"supabase"`, `"throneMode":"game"`, `"coinPacks":false`.
- [ ] **Game:** phone A: Play free → Start free → coins chip shows the welcome coins and an amber **Back up** badge → I saved my backup code → badge turns green **Saved**.
- [ ] Ad card with a picture saves (tests Supabase Storage) → Play → the 3D board appears → solve → "You took the Throne!" → the billboard shows the ad and the time on phone B within seconds.
- [ ] Phone B (on mobile data, not the same Wi-Fi): new wallet → solve faster → phone A sees the takeover live; leaderboard and live feed update on both.
- [ ] Reset timer: give up 3 times in a row → a break countdown appears. Open a **private window on the same phone** → a new wallet there gets **no** welcome coins, and after saving an ad card, Play shows the same break (the browser signature follows the phone, not the storage).
- [ ] Reload in the middle of a game → the same board comes back with the clock still running.
- [ ] Backup code on a **second browser or PC** → Restore → same coins, records and badges.
- [ ] Daily coins claim works; a second claim is refused until tomorrow.
- [ ] Invite: phone A's link opened on phone B (different network) → B plays one game → A's `/invite` page shows B as "Playing" and +coins.
- [ ] Crown Shield: the king buys 10 minutes → the panel shows the shield; a challenger needs to be 10% faster.
- [ ] Book a Market stall **with coins** → it goes live; the balance drops.
- [ ] Nigeria (`?region=ng`): the ad card waits in review (about 5 minutes) → `/admin` → Game & wallets shows it → Approve.
- [ ] If B4 payments are on: book a Market stall **with money** in each edition with the processor's test card → it goes live after the webhook.
- [ ] `/admin` (ADMIN_TOKEN): Treasury opens; Game & wallets → find a wallet → adjust coins (with a reason) → ban → that wallet can't play → unban; void a result → that reign ends.
- [ ] Report an ad from a third browser → it appears in Moderation.
- [ ] Pages at phone width: `/`, `/invite`, `/wallet`, `/practice`, `/kings`, `/faq`, `/legal`, `/contact`: no sideways scrolling, nothing cut off.
- [ ] Sound on/off, language picker, dark mode.

Fix anything found here before phase C.

## C. Production

- [ ] **C1. Switch the blueprint (Dev):** copy `deploy/render.production.yaml` over `render.yaml`, commit, push. (Paid always-on API, `TRUST_PROXY=2`, game mode, coin packs off, no video worker.)
- [ ] **C2. Supabase production (You):** a **new** project `throne-prod`, Frankfurt, strong database password → run `supabase/schema.sql`. Recommended: the Pro plan for daily backups once real users arrive. Copy Project URL + service_role key.
- [ ] **C3. Safety keys (You):** OpenAI API key; Google Cloud → enable *Web Risk API* → API key restricted to it; Cloudflare Turnstile widget for `yourdomain.com` (Managed).
- [ ] **C4. Render production API (You):** New → Blueprint → `throne-api` (Starter). Fill in every prompted value:
  | Variable | Value | Secret? |
  |---|---|---|
  | `PUBLIC_URL` | `https://api.yourdomain.com` | no |
  | `SITE_URL`, `CORS_ORIGIN` | `https://yourdomain.com` | no |
  | `SUPABASE_URL` | C2 Project URL | no |
  | `SUPABASE_SERVICE_ROLE_KEY` | C2 service_role key | **yes** |
  | `PAYSTACK_SECRET_KEY` | Paystack **live** secret (`sk_live_…`) | **yes** |
  | `FLUTTERWAVE_SECRET_KEY` | Flutterwave **live** v3 secret (`FLWSECK-…`) | **yes** |
  | `FLUTTERWAVE_WEBHOOK_HASH` | a new long random text (also typed into Flutterwave in C8) | **yes** |
  | `OPENAI_API_KEY`, `WEB_RISK_API_KEY`, `TURNSTILE_SECRET_KEY` | C3 | **yes** |

  `ADMIN_TOKEN`, `ORIGIN_SECRET`, `IP_HASH_SALT` are generated by Render: copy `ADMIN_TOKEN` and `ORIGIN_SECRET` to your password manager.
  The API **refuses to start** if any required key is missing; the log names it.
- [ ] **C5. API domain (You):** Render → throne-api → Custom Domains → `api.yourdomain.com`. Cloudflare DNS → `CNAME api → <render target>`, **Proxied**. SSL/TLS → **Full (strict)**.
- [ ] **C6. Origin lock (You, required):** Cloudflare → Rules → Transform Rules → Modify Request Header: when `http.host eq "api.yourdomain.com"`, **set** `X-Origin-Secret` = `ORIGIN_SECRET`. Without it the API answers 403 to everyone.
- [ ] **C7. Paystack live (You):** Live Mode → Settings → API Keys & Webhooks → Live Webhook URL `https://api.yourdomain.com/api/webhooks/paystack`.
- [ ] **C8. Flutterwave live (You):** Settings → Webhooks → URL `https://api.yourdomain.com/api/webhooks/flutterwave`, secret hash = `FLUTTERWAVE_WEBHOOK_HASH`, "charge completed" ticked.
- [ ] **C9. Website (You):** Cloudflare Pages production project: `NODE_VERSION=22`, `VITE_API_URL=https://api.yourdomain.com`, `VITE_MEDIA_ORIGIN` = C2 Project URL, `VITE_TURNSTILE_SITE_KEY` = C3 site key, `VITE_SITE_URL=https://yourdomain.com` → Deploy → Custom domains → `yourdomain.com`.
- [ ] **C10. Cloudflare rules (You):** the rate-limit rule and the managed ruleset from DEPLOY.md step 9; exclude `/api/webhooks/*` from challenges; Bot Fight Mode **off** at first.

## D. Go-live checks (Dev + You, before announcing)

- [ ] `https://api.yourdomain.com/api/health` → `store: supabase`, `storage: supabase`, `payments: {global: flutterwave, ng: paystack}`, `moderation: true`, `linkChecks: true`, `botCheck: true`, `throneMode: game`, `coinPacks: false`, `env: production`.
- [ ] `https://<render-url>.onrender.com/api/state` → **403** (origin lock works).
- [ ] The whole of B5 again on the real domain (quick pass), with the Turnstile check visible on new wallets.
- [ ] One small **real** booking in each edition (Paystack ₦, Flutterwave $) → live after the webhook; Paystack/Flutterwave dashboards show the webhook delivered (200). (Refund it from the processor's dashboard afterwards if you like.)
- [ ] `/admin` shows **Healthy**; revenue shows the two test bookings in the right currencies.
- [ ] `https://yourdomain.com/sitemap.xml` and `/robots.txt` show the real domain.
- [ ] Legal page: Terms, Coins & the Throne Race, Privacy, Ad Policy read correctly; the company line is at the bottom of the legal page only.

## E. After launch

- [ ] Every day: `/admin` → Treasury (alerts), Review queue (videos and Nigeria cards), Moderation (reports), Game & wallets → *Flagged (too fast)*.
- [ ] Every week: Paystack/Flutterwave → webhook delivery logs (no failures); Supabase → database size and backups.
- [ ] A phone alert on `GET /api/admin/health` (e.g. an uptime monitor) so paid videos and refunds never wait.
- [ ] If any secret ever leaks (chat, screenshot, email): regenerate it in its dashboard and update Render immediately.
- [ ] Before changing the game's rules or prices: update the Terms and FAQ, bump `TERMS_VERSION` in `backend/src/config.js`, and add a Changelog entry.
