# Test deploy (staging) on free tiers

A public test copy of Project Throne at **$0**:

| Piece | Where | Free-tier catch |
|---|---|---|
| Website | Cloudflare Pages → `https://<name>.pages.dev` | none |
| API | Render (free web service) → `https://<name>.onrender.com` | sleeps after 15 min idle; first visit after that takes ~1 min |
| Database + images | Supabase (free) | pauses after 7 days without activity; "Restore" in the dashboard wakes it |
| Payments | **demo mode** (fake pay button) | no money moves. Real payments come with Paystack |
| Hype videos | **off** | the video worker needs a paid plan |

Staging runs with `DEPLOY_ENV=staging`, which allows demo payments and missing optional keys.
It's a test site only: anyone can "pay" with the demo button.

**Golden rule: secret keys go only into the Render / Cloudflare dashboards, never into chat, email or the code.**
Things you can safely share with your developer (or me): URLs, the Turnstile *site* key, and screenshots of errors.

---

## Step 1: GitHub (you, 2 min)
1. github.com → **New repository** → name `throne-app` → **Private** → don't add a README → Create.
2. Share the repo URL (e.g. `https://github.com/you/throne-app`). Then from the project folder run:
   `git remote add origin <URL>` and `git push -u origin main`.
   A GitHub sign-in window may pop up the first time.

## Step 2: Supabase (you, 5 min)
1. supabase.com → **New project**. Name `throne-staging`, region **Central EU (Frankfurt)**, and generate a database password (save it in a password manager).
2. When it's ready: **SQL Editor** → New query → paste the whole of `supabase/schema.sql` → **Run**. It should end with "Success".
3. **Project Settings → API**. Keep this tab open for step 4:
   - **Project URL** (`https://xxxx.supabase.co`). Not secret; you can share it.
   - **service_role** key. **SECRET**: it bypasses all security. It goes only into Render.

## Step 3: Pick your two names
- Render API: `throne-api-staging`. Your API will be `https://throne-api-staging.onrender.com`. If that name is taken, Render adds a suffix; use whatever URL Render shows.
- Cloudflare Pages project: pick a name, e.g. `throne-test`. Your site will be `https://throne-test.pages.dev`.

## Step 4: Render: the API (you, 5 min)
1. render.com → **New → Blueprint** → connect GitHub → pick `throne-app`. Render reads `render.yaml` and shows one service: `throne-api-staging` (Free).
2. Fill in the prompted values:
   - `CORS_ORIGIN` and `SITE_URL` → your Pages URL from step 3 (e.g. `https://throne-test.pages.dev`)
   - `SUPABASE_URL` → Project URL from step 2
   - `SUPABASE_SERVICE_ROLE_KEY` → service_role key from step 2
3. **Apply.** The first build takes a few minutes.
4. Open `https://<your-api>.onrender.com/api/health`. You should see `"env":"staging"`, `"store":"supabase"`, `"storage":"supabase"`.
5. Copy **`ADMIN_TOKEN`** from the service's **Environment** tab into your password manager (it opens `/admin`).

## Step 5: Cloudflare Turnstile: bot check (optional, you, 2 min)
Cloudflare dashboard → **Turnstile → Add widget** → hostname `throne-test.pages.dev` → mode *Managed*.
- **Site key** (public) → used in step 6.
- **Secret key** → Render → `throne-api-staging` → Environment → add `TURNSTILE_SECRET_KEY` → Save.

## Step 6: Cloudflare Pages: the website (you, 5 min)
1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → `throne-app`.
2. Project name: your name from step 3. Production branch `main`. Framework preset **None**.
3. Root directory `frontend`, build command `npm run build`, output directory `dist`.
4. **Environment variables:**

| Variable | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `VITE_API_URL` | your Render URL, e.g. `https://throne-api-staging.onrender.com` |
| `VITE_MEDIA_ORIGIN` | your Supabase Project URL |
| `VITE_TURNSTILE_SITE_KEY` | site key from step 5 (or leave out) |

5. **Save and Deploy.**

## Step 7: Optional safety keys (any time)
In Render → Environment, add one at a time (each Save redeploys):
- `OPENAI_API_KEY`: AI screening of ads. The moderation endpoint is free to use.
- `WEB_RISK_API_KEY`: Google malware/phishing link checks. Google requires billing to be enabled on the project, even within the free quota.

## Step 8: Check it works
Send the two URLs to your developer, who checks: health, CORS, live updates across two browsers, an image upload to Supabase Storage, the archive, the admin page, reports and takedowns. Things to expect:
- The first load after idle takes ~1 minute (Render free tier waking up).
- The yellow "Demo mode" banner is correct: payments are simulated.

## Moving to production later
1. A real domain on Cloudflare (enables the origin lock and `api.yourdomain.com`).
2. Real payments: Paystack (next build step).
3. Copy `deploy/render.production.yaml` over `render.yaml` (paid always-on API + video worker), then follow `DEPLOY.md`.
