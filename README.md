# ANERITH — Proprietary Trading Firm Platform

**Your edge. Funded.**

ANERITH is a full-stack prop-firm platform. Traders register, receive a free trial desk, buy evaluations or instant funded programs, trade a professional multi-asset terminal, complete KYC, request profit payouts and compete on a live leaderboard. Operators get an admin command desk for payout review, identity checks, account health, broker routing and competition control.

---

## What is included

| Area | Capabilities |
| --- | --- |
| Marketing site | Promo rail, live market ticker, program comparison, terminal preview, live competition panel, FAQ, scroll-reveal motion |
| Theming | Dark and light themes, system preference detection, saved per-browser preference, toggle in Settings and the app shell |
| Auth | Email/password registration, login, logout, JWT httpOnly sessions, rate limiting, origin checks, password change |
| Accounts | Free trial, evaluations, funded desks; Momentum / Horizon / Velocity programs; $10K–$200K; multi-account switcher |
| Account store | Deep-linkable plan + size checkout, rulebook modal, program comparison, PesaPal card/mobile-money checkout, payment history, instant provisioning |
| Trading terminal | Candlestick charts (7 timeframes), market/limit/stop orders, SL/TP, position modification, close/close-all, live tick stream, watchlist |
| Risk engine | 1-second tick; pending-order triggers, protective exits, 50% stop-out, daily loss reset, max drawdown (static/trailing), targets, minimum trading days, phase advancement |
| Payouts | Profit-split withdrawals, KYC gate, reserved balance, admin approval, printable payout certificates |
| KYC | Identity submission, compliance review queue, admin approve/reject |
| Competitions | Join with an active account, live equity-based scoring, peak return tracking, automatic settlement, 50/30/20 prize payouts, next-round rollover, admin create/settle controls |
| Analytics & history | Equity curve, win rate, profit factor, long/short split, symbol performance, trade/ledger tables, CSV export |
| Admin console | Metrics, payout review, KYC queue, accounts, users, broker bridges, competition lifecycle |
| Broker integration | Bridge registry (MT5, Match-Trader, cTrader) with handshake tests, pause/resume, event log, per-account routing |
| Supabase | Ready-to-run mirror schema, REST client, connection health endpoint and operator-triggered snapshot sync |

---

## Tech stack

- **Next.js 15.5** (App Router) + **React 19** + TypeScript (strict)
- **Tailwind CSS v4** with a token-driven dark/light design system
- **SQLite** through the built-in `node:sqlite` driver (no native compilation)
- **lightweight-charts** for candlestick and volume charts
- **jose** sessions, **bcryptjs** password hashing, **zod** validation
- **Vitest** unit tests

Market data is produced by a deterministic multi-octave pricing engine (`src/lib/market.ts`), so quotes, ticks and every timeframe stay coherent across requests and restarts.

---

## Quick start

Requirements: **Node.js 24+** (needed for `node:sqlite`) and npm.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

The SQLite database is created and seeded automatically at `data/anerith.db` on first boot.

### Seeded accounts

Demo fixtures are created in development only. In production the admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, and the demo trader, demo accounts and sample leaderboard are withheld unless `SEED_DEMO_DATA=true`.

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Trader | `demo@anerith.local` | `Demo!2345` | Trial + evaluation + funded desk, open positions, history, a completed payout |
| Admin | `admin@anerith.local` | `Admin!2345` | Full admin console, own trial desk |

The login screen includes a **Use example** shortcut for the trader workspace.

---

## Programs

| Program | Structure | Target | Drawdown | Split | Min. days | Payout cycle |
| --- | --- | --- | --- | --- | --- | --- |
| **Momentum** | One phase | 10% | 6% static | 80% | 5 | 10 days |
| **Horizon** | Two phases | 8% / 5% | 5% per phase | 90% | 5 / phase | 14 days |
| **Velocity** | Instant funded | — | 6% trailing | 80% | 0 | 7 days |
| **Discovery** | Free trial | 6% | 6% static | — | 3 | — |

Every program shows its full rulebook in the account store before checkout. Rules cover objectives, daily loss, drawdown mode, minimum days, payout cycles, consistency and risk limits.

---

## Competition engine

- Entries are scored from **verified account equity** measured from the trader's entry baseline.
- The leaderboard refreshes on every engine tick and the UI polls every 15 seconds.
- Peak return is tracked alongside current return.
- At `end_at` the engine settles automatically: ranks are finalised, 50/30/20 prizes are written to the ledger as `competition_prize` transactions, notifications are sent, and the next 30-day round opens automatically.
- An admin can open a new round or force settlement from **Admin → Competition**.
- Prize allocation only credits traders with a positive return and a linked account.

---

## Background engine

`src/instrumentation.ts` starts a one-second loop on boot:

- triggers pending limit/stop orders and protective exits
- enforces stop-out levels and account risk rules
- advances passed evaluations and closes failed accounts
- refreshes competition returns and settles expired rounds
- auto-completes approved payouts and verification decisions
- emits broker heartbeats

---

## Production deployment (free forever)

### Why not Netlify

Netlify runs serverless functions on an ephemeral filesystem. This platform depends on two things serverless hosting cannot provide:

- a writable, persistent SQLite file shared by every request
- a 1-second loop that triggers stops, handles pending orders and settles competitions

Deployed to Netlify as-is, the database would reset on cold starts and protective exits would never run. A Netlify build also needs a hosted database (Turso or Postgres), an async rewrite of the data layer, and a scheduled function for the engine — and Netlify's free plan is credit-metered and pauses the site when credits run out.

The route below is **free forever** on Oracle Cloud's Always Free tier (currently 2 OCPU / 12 GB Ampere ARM, 200 GB total block storage) and keeps SQLite and the 1-second engine intact.

### 1. Create the server

1. In Oracle Cloud, open **Compute → Instances → Create instance**.
2. Image: **Ubuntu 24.04**. Shape: **Ampere A1 Flex**, 2 OCPU and 12 GB RAM.
3. Set the boot volume to **100 GB** (Always Free includes 200 GB across boot and block volumes).
4. Add your SSH public key and create the instance. Note the public IP.
5. Under **Networking → VCN → Security Lists**, add ingress rules for TCP **80** and **443** from `0.0.0.0/0`. Keep SSH (22) restricted to your IP.
6. Point an **A record** for your domain (and `www`) at the public IP.

### 2. Install Docker

```bash
ssh ubuntu@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Log out and back in so the group change applies.

### 3. Put the code on the server

The project is not a git repository yet. Initialise one, push it to GitHub (keep it **private**), then clone it on the server:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:YOUR_USER/anerith.git
git push -u origin main

# on the server
git clone git@github.com:YOUR_USER/anerith.git
cd anerith
```

`data/`, `.env*` and `backups/` are git-ignored, so no local database or secrets are pushed.

### 4. Configure production environment

```bash
cp .env.production.example .env.production
openssl rand -hex 48          # copy the output into SESSION_SECRET
nano .env.production
```

Required values:

| Variable | Purpose |
| --- | --- |
| `DOMAIN` | Public hostname used by Caddy for automatic HTTPS |
| `APP_URL` | `https://` base URL used in PesaPal callbacks and IPNs |
| `SESSION_SECRET` | 64+ random characters; the app refuses to boot in production without it |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First administrator, seeded on first boot only |
| `SEED_DEMO_DATA=false` | Keeps demo credentials and the fake leaderboard out of production |
| `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET` | Live PesaPal credentials |
| `PESAPAL_ENV=live` | Switches the checkout to the PesaPal production host |

### 5. Launch

```bash
docker compose up -d --build
docker compose ps
curl -fsS https://YOUR_DOMAIN/api/health
```

Caddy obtains and renews the TLS certificate automatically once DNS resolves. The health endpoint reports database and engine status; the container also uses it as its Docker health check.

To follow logs:

```bash
docker compose logs -f app
```

### 6. Connect PesaPal

1. In the PesaPal dashboard, confirm the live consumer key and secret are the ones in `.env.production`.
2. The IPN URL `https://YOUR_DOMAIN/api/payments/pesapal/ipn` must be publicly reachable; the app registers it on the first checkout.
3. Run a live test: buy an account, pay on the hosted page, and confirm the account appears in **Accounts** with a `challenge_purchase` transaction.
4. A browser-close or duplicate callback must still produce exactly one account — payment intents are idempotent.

### 7. Backups

The database lives in the `anerith_data` Docker volume. The image ships a consistent snapshot script:

```bash
# on demand
docker compose exec -T app node scripts/backup-db.mjs

# nightly at 03:00 on the host (crontab -e)
0 3 * * * cd /home/ubuntu/anerith && docker compose exec -T app node scripts/backup-db.mjs
```

Backups land in the `anerith_backups` volume. Copy them off the server with `scp` or `rclone`; a backup that only exists on the same VM is not disaster recovery.

To restore:

```bash
docker compose stop app
docker run --rm -v anerith_anerith_data:/data -v "$PWD":/restore alpine \
  sh -c "rm -f /data/anerith.db-wal /data/anerith.db-shm && cp /restore/anerith-YYYY-MM-DD.db /data/anerith.db"
docker compose start app
```

### 8. Updates

```bash
git pull
docker compose up -d --build
curl -fsS https://YOUR_DOMAIN/api/health
```

### Operational constraints

- **One app replica.** The risk engine, competition timer and rate limiter run inside the Node process. Do not scale `app` horizontally without moving the engine to a dedicated worker and rate limiting to Redis.
- **HTTPS is required.** Session cookies are `secure` in production, and PesaPal callbacks must use HTTPS.
- **Persistent disk only.** Never deploy this build to a host without a persistent volume.

---

## Payments — PesaPal v3

Card and mobile-money checkout runs through PesaPal's hosted payment page. The local ledger records a `payment_intents` row before the shopper leaves the site, so every payment can be reconciled even if the browser closes.

1. Create a merchant account at [pesapal.com](https://pesapal.com) and copy the consumer key/secret from the PesaPal dashboard.
2. Add the credentials to `.env.local`:

```bash
PESAPAL_ENV=sandbox
PESAPAL_CONSUMER_KEY=your-consumer-key
PESAPAL_CONSUMER_SECRET=your-consumer-secret
PESAPAL_CURRENCY=USD
APP_URL=https://your-public-host
```

3. Restart the app. Open the account store — **PesaPal** is enabled automatically when both credentials are present.

Flow:

- `POST /api/payments/pesapal/initiate` — authenticated, same-origin, rate limited. Creates a pending intent, registers the IPN endpoint on first use, submits the order and returns the PesaPal redirect URL.
- `GET /api/payments/pesapal/callback` — PesaPal redirects the shopper here. The server re-queries the transaction status, provisions the desk exactly once and sends the shopper back to `/app/challenges?payment=…&ref=…`.
- `GET|POST /api/payments/pesapal/ipn` — server-to-server IPN. Verifies status with PesaPal, settles the intent idempotently and always acknowledges with the expected JSON shape.
- `GET /api/payments/pesapal/status?intentId=…` — authenticated reconciliation used when the shopper returns or a pending payment needs a refresh.

Settlement rules:

- A desk is provisioned only when PesaPal reports `Completed`.
- Currency, merchant reference and paid amount must match the stored intent; mismatches are marked failed and never provision an account.
- `completeChallengePurchase` is keyed by the intent id, so callback retries, duplicate IPNs and refreshes cannot create a second account or ledger entry.
- PesaPal requires a publicly reachable IPN URL. In local development use a tunnel (ngrok, Cloudflare Tunnel) and set `APP_URL`, or pre-register the endpoint and set `PESAPAL_IPN_ID`.

Payments are also included in the Supabase mirror (`payment_intents`).

---

## Supabase integration

The local SQLite database remains the authoritative write path. Supabase is an optional reporting and integration mirror.

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Add the following to `.env.local`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Restart the app.

Operator endpoints (admin session required):

- `GET /api/integrations/supabase` — connection health, key type, latency and mirror table list
- `POST /api/integrations/supabase` — push a snapshot of profiles, accounts, transactions, payouts, competitions and entries into Supabase

RLS is enabled on every mirror table. Trader-facing policies restrict reads to the authenticated owner; competitions and leaderboard entries are readable by authenticated users. The service role bypasses RLS for sync.

---

## App structure

```
src/
  app/
    page.tsx                 Marketing site with promo rail, imagery and scroll motion
    app/                     Authenticated workspace (dashboard, terminal, store, accounts, payouts, analytics, history, competitions, settings, admin)
    api/                     Route handlers (auth, trading, accounts, payouts, admin, competitions, integrations, payments, health)
  components/                Client UI, landing sections, terminal, admin desk
  instrumentation.ts         Validates production env and boots the risk and competition engine
  lib/
    accounts.ts              Provisioning and account math
    challenges.ts            Programs, sizes, rules and names
    competitions.ts          Scoring, settlement, prizes, rollover
    engine.ts                One-second orchestration loop
    env.ts                   Production environment validation
    objectives.ts            Risk rules and evaluation advancement
    market.ts                Deterministic price feed
    pesapal.ts               PesaPal v3 client (auth, IPN, orders, status)
    payments.ts              Payment intents, verification and idempotent fulfillment
    supabase.ts              REST client, health check and snapshot sync
Dockerfile                   Multi-stage production image (Node 24)
docker-compose.yml           App + Caddy with persistent database volume
Caddyfile                    Automatic HTTPS reverse proxy
scripts/backup-db.mjs        Consistent SQLite snapshot
supabase/schema.sql          Mirror tables, indexes and RLS policies
data/anerith.db              SQLite database (created on first boot)
```

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Vitest unit tests |
| `node scripts/backup-db.mjs` | Consistent SQLite backup inside the container |
| `docker compose up -d --build` | Build and start app + reverse proxy |

---

## Design notes

- **Theme tokens:** `:root` defines the dark palette, `[data-theme="light"]` overrides the same tokens. An inline boot script applies the saved theme before first paint; `ThemeProvider` keeps it in sync and powers the Settings toggle.
- **Money:** stored as integer cents in SQLite and exposed as USD in DTOs.
- **Concurrency:** the risk engine is guarded by an in-process `ticking` flag; SQLite runs in WAL mode with a busy timeout.
- **RSC safety:** SQLite rows are spread into plain objects before crossing into client components.

---

## Security

- bcrypt password hashing (cost 10) and httpOnly JWT session cookies
- same-origin enforcement on all state-changing routes
- per-route rate limiting on auth, checkout and trading endpoints
- zod validation at every API boundary
- service-role Supabase keys stay server-side and are never exposed to the browser

---

**Anerith Capital** · Proprietary trading platform · © 2026
