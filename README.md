# SpendPilot Backend

Demo-stable Express + MongoDB backend for SpendPilot: PDF statement → card data →
deterministic payment optimizer → AI explanation, with Plaid Sandbox for dashboard
data and a lightweight help chatbot + CRM.

## Quick start

```bash
npm install
cp .env.example .env          # then edit secrets
npm run dev                   # auto-reload, or: npm start
```

Optional demo data (a demo user, an admin, cards, transactions, a ticket):

```bash
SEED_DEMO_DATA=true npm start   # seeds on boot
# or one-off:
npm run seed
```

Seeded credentials (when `SEED_DEMO_DATA=true`):
- User: `demo@spendpilot.app` / `Demo1234!`
- Admin: `admin@spendpilot.app` / `Admin1234!`

## Architecture

```
src/
  server.js              Boot: validate env → connect DB → (seed) → listen, graceful shutdown
  app.js                 Express wiring: security, CORS, sanitize, logging, routes, errors
  config/                env (validated), logger (winston), db, ai (Claude), plaid
  middleware/            auth (JWT), rateLimiter, requestLogger, validate, upload, error
  models/                User, Card, Transaction, SupportTicket, OptimizerRecommendation
  services/              optimizer, pdfParser, aiExplanation, plaid, chatbot
  controllers/           one per domain
  routes/                one per domain (mounted under /api)
  utils/                 money, dates, asyncHandler, ApiError, seedDemoData
```

## Security & operations

- **Password hashing** — bcrypt; `passwordHash` is `select:false` and stripped from JSON.
- **JWT auth** — `protect` middleware; `requireAdmin` for CRM routes.
- **Rate limiting** — broad limiter on `/api`, tighter limiters on auth and AI/chatbot routes.
- **Injection hardening** — `helmet`, `express-mongo-sanitize` (NoSQL operators), `hpp`,
  JSON body size cap, `strictQuery`.
- **IP tracking** — `trust proxy` so `req.ip` is the real client; logged per request and
  stored as `lastLoginIp` on login.
- **Per-request logging** — winston with a level chosen by outcome (5xx→error, 4xx→warn,
  else http), including method, URL, status, **response time (ms)**, IP, user, and a
  correlation `X-Request-Id`. Control verbosity with `LOG_LEVEL`.
- **Health monitoring** — `GET /api/health` (liveness + dependency status) and
  `GET /api/health/ready` (readiness, 503 until DB connects).
- **Safe env** — all config goes through `config/env.js`, which validates required secrets
  and refuses insecure defaults in production. No other file reads `process.env` directly.
- **Consistent errors** — every failure returns `{ error: "message" }` (plus `details` for
  validation); stack traces are logged server-side only, never sent to clients.
- **Demo resilience** — Plaid and AI fall back to seeded/deterministic output when keys are
  missing or upstream fails, so the demo never hard-fails.

## API

| Area      | Method + Route                          | Auth        |
|-----------|------------------------------------------|-------------|
| Health    | `GET /api/health`, `GET /api/health/ready` | none      |
| Auth      | `POST /api/auth/signup`, `POST /api/auth/login` | none |
| Profile   | `GET /api/profile`, `PATCH /api/profile` | user        |
| Cards     | `GET/POST /api/cards`, `GET/PATCH/DELETE /api/cards/:id` | user |
| Statements| `POST /api/statements/upload` (field `statement` or `pdf`) | user |
| Optimizer | `POST /api/optimizer/recommend`          | user        |
| AI        | `POST /api/ai/explain`                    | user        |
| Plaid     | `POST /api/plaid/create-link-token`, `POST /api/plaid/exchange-public-token`, `GET /api/plaid/accounts`, `GET /api/plaid/transactions` | user |
| Chatbot   | `POST /api/chatbot/ask`                   | user        |
| Support   | `POST /api/support/tickets`, `GET /api/support/tickets` | user |
| Admin     | `GET /api/admin/users`, `GET /api/admin/tickets`, `PATCH /api/admin/tickets/:id` | admin |

### Optimizer (deterministic — AI never decides amounts)

`POST /api/optimizer/recommend` with `{ maxPayment, cards? }` (omit `cards` to use the
user's stored cards). Covers minimum payments first; if funds can't cover all minimums it
protects the nearest due dates; any extra goes to the highest-APR card (debt avalanche),
tie-broken by nearer due date then higher balance. Returns `strategy`, `plan`,
`riskScores`, and `warning`. The AI explanation endpoint only explains this plan.

## Environment

See `.env.example`. Notable: `JWT_SECRET` (required in production), `ANTHROPIC_API_KEY` +
`AI_MODEL` (blank → deterministic fallback), `PLAID_*` (blank → seeded demo data),
`LOG_LEVEL`, and the `RATE_LIMIT_*` knobs.
