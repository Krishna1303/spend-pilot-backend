# Deploying SpendPilot Backend to Vercel

This backend runs on Vercel as a **single serverless function** (the Express
app), with the daily card sync driven by **Vercel Cron**.

## How it's wired

- `api/index.js` — serverless entry: validates env, ensures a cached Mongo
  connection, then delegates to the Express app. It does **not** call
  `app.listen()` and does **not** start the in-process scheduler.
- `vercel.json` — routes all requests to the function (which serves both the
  API and the static landing page), and registers the cron job.
- `src/config/db.js` — caches the Mongo connection across warm invocations.
- `GET /api/cron/card-sync` — the daily sync, triggered by Vercel Cron and
  protected by `CRON_SECRET`.
- `src/server.js` is still used for **local** dev (`npm start`); Vercel uses
  `api/index.js` instead.

## 1. Prerequisites

- **MongoDB Atlas** (or any internet-reachable MongoDB). A `localhost` URI will
  not work on Vercel — provision a free Atlas cluster and allow access from
  anywhere (`0.0.0.0/0`) or from Vercel's IP ranges.
- A **Vercel account** and the repo pushed to GitHub/GitLab/Bitbucket (or use
  the Vercel CLI).

## 2. Required environment variables (Vercel → Project → Settings → Environment Variables)

Vercel sets `NODE_ENV=production` automatically. In production the app refuses
to boot unless these are set correctly:

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | ✅ | Atlas connection string (`mongodb+srv://...`) |
| `JWT_SECRET` | ✅ | Long random string (≥16 chars). `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGIN` | ✅ | Comma-separated allowed origins — **must not be `*`** in production. Include your frontend origin(s), e.g. `https://thespendpilot.com,https://www.thespendpilot.com` |
| `CRON_SECRET` | ✅ (for sync) | Random string; Vercel Cron sends it as a Bearer token. Without it `/api/cron/card-sync` returns 403 |
| `TOTP_ENCRYPTION_KEY` | recommended | Key for encrypting TOTP secrets at rest (falls back to `JWT_SECRET`) |
| `ANTHROPIC_API_KEY` | optional | Blank → deterministic AI fallback |
| `AI_MODEL` | optional | Default `claude-opus-4-8` |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | optional | Blank → seeded demo data |
| `PLAID_ENV` / `PLAID_PRODUCTS` / `PLAID_COUNTRY_CODES` | optional | Defaults: sandbox / transactions / US |
| `MAIL_ENABLED` | optional | `true` + SMTP_* to actually send escalation emails |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | optional | Required only if `MAIL_ENABLED=true`. `SMTP_FROM` must be `Name <addr@host>` |
| `ADMIN_EMAIL` | optional | Where escalation emails go |
| `CRM_TOTP_REQUIRED` | optional | `true` (default) keeps the CRM behind TOTP |
| `TOTP_ISSUER` / `CRM_TOKEN_EXPIRES_IN` | optional | Defaults: `SpendPilot` / `15m` |
| `LOG_LEVEL` | optional | `info` default |
| `JWT_EXPIRES_IN` / `BCRYPT_SALT_ROUNDS` | optional | Defaults: `7d` / `10` |

> Do **not** set `SEED_DEMO_DATA` on Vercel — seeding runs from `server.js`,
> not the serverless entry. Seed your Atlas database once from your machine
> instead (see step 5).

## 3. Deploy

**Option A — Git integration (recommended):**
1. Import the repo in the Vercel dashboard.
2. Framework preset: **Other** (no build step needed; `vercel.json` handles it).
3. Add the environment variables above.
4. Deploy. Vercel detects `vercel.json` and builds `api/index.js`.

**Option B — CLI:**
```bash
npm i -g vercel
vercel            # first run links the project
vercel --prod     # production deploy
```
Add env vars with `vercel env add <NAME> production` (or in the dashboard).

## 4. Verify

- `https://<your-app>.vercel.app/` → the branded landing/status page.
- `https://<your-app>.vercel.app/api/health` → `{ ok: true, ... }` with
  `dependencies.db: "connected"` (confirms Atlas is reachable).
- `POST /api/auth/signup` → returns a token.

## 5. Seed the admin + demo data (once, against Atlas)

The CRM needs an admin account. Seed it from your machine, pointing at Atlas:

```bash
MONGODB_URI="mongodb+srv://...your-atlas..." SEED_DEMO_DATA=true npm run seed
```

This creates `admin@spendpilot.app` / `Admin1234!` and demo data. Change the
admin password afterward via the API.

## 6. Daily card sync (Vercel Cron)

`vercel.json` registers:
```json
"crons": [{ "path": "/api/cron/card-sync", "schedule": "0 3 * * *" }]
```
Vercel calls it daily at 03:00 UTC with `Authorization: Bearer $CRON_SECRET`.
The handler runs `syncAllUsers()` (idempotent — at most one pull per card per
day). To trigger it manually:
```bash
curl https://<your-app>.vercel.app/api/cron/card-sync \
  -H "Authorization: Bearer $CRON_SECRET"
```
> Hobby plan: cron jobs run on a daily cadence — the 03:00 schedule fits.

## 7. Notes & caveats

- **CORS:** add the exact origin your frontend is served from. If the frontend
  is also on Vercel (e.g. `https://spendpilot.vercel.app`), include it.
- **PDF parsing:** `pdf-parse` needs native canvas/DOM globals that may not be
  present in the serverless bundle. The parser loads lazily and degrades to a
  clean `400` (the app's manual-entry fallback) if it can't run — it will never
  crash the function. Local/standard Node still extracts normally.
- **Cold starts:** the first request after idle reconnects to Atlas; subsequent
  warm requests reuse the cached connection.
- **Function logs:** Vercel dashboard → Deployments → Functions → Logs.
