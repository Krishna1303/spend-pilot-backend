# SpendPilot API Reference (for frontend)

Everything the frontend needs to wire up routes. All endpoints are under
`/api`. Responses are JSON. Errors are always `{ "error": "message" }` (plus an
optional `details: []` array on validation errors).

---

## 1. Base URL & auth model

| Environment | Base URL |
|---|---|
| Local | `http://localhost:5000` (or your `PORT`) |
| Production | `https://<your-app>.vercel.app` |

**Auth is JWT bearer.** Sign up or log in → you get a `token`. Send it on every
protected request:

```
Authorization: Bearer <token>
```

Recommended client wiring:

```ts
const API = import.meta.env.VITE_API_URL; // e.g. https://api.thespendpilot.com

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, details: data.details });
  return data;
}
```

**Token lifecycle**
- Store the `token` (e.g. `localStorage` / secure cookie) after signup/login.
- On any `401`, treat the session as expired → clear token → route to login.
- Token expires in `JWT_EXPIRES_IN` (default 7d).

**CORS:** the API only allows origins in its `CORS_ORIGIN` list. Make sure your
frontend origin is included (local dev ports + your production domain).

**Rate limits:** broad limiter on `/api`; tighter on `/api/auth/*` and
`/api/ai/*` + `/api/chatbot/*`. On `429`, back off and retry.

**Status codes you'll handle:** `200/201` ok · `400` validation · `401` no/bad
token · `403` forbidden (e.g. not admin / TOTP step-up needed) · `404` not found
· `409` conflict (duplicate email) · `429` rate limited · `5xx` server.

---

## 2. Auth

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/signup` | – | `{ name, email, password }` | `{ token, user }` |
| POST | `/auth/login` | – | `{ email, password }` | `{ token, user }` |

`user` shape: `{ id, name, email, mobile, profileImageUrl, role, subscriptionPlan, createdAt }`.
Wrong credentials → `401`. Duplicate email on signup → `409`.

---

## 3. Profile (My Profile tab)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/profile` | user | – | `{ user }` |
| PATCH | `/profile` | user | any of `{ name, mobile, profileImageUrl, email, subscriptionPlan }` | `{ user }` |
| DELETE | `/profile` | user | `{ password }` | `{ deleted: true }` |

Email change is uniqueness-checked (`409` if taken). Delete requires the current
password (`401` if wrong) and cascades all the user's data.

---

## 4. Cards (Cards tab — Credit / Debit sub-tabs)

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/cards` | user | `?type=credit` or `?type=debit` (optional) | `{ cards: [...] }` |
| POST | `/cards` | user | `{ cardType, bankName, cardName, last4, balance, statementBalance, minimumPayment, dueDate, apr, creditLimit }` | `{ card }` |
| GET | `/cards/:id` | user | – | `{ card }` |
| PATCH | `/cards/:id` | user | any editable card field | `{ card }` |
| DELETE | `/cards/:id` | user | – | `{ deleted, id }` |
| POST | `/cards/sync` | user | `?force=true` (optional) | `{ synced, skipped, upserted }` |

`cardType` is `"credit"` or `"debit"` (default `credit`). Use `?type=` for the
two sub-tabs. `card` includes a computed `utilization` (percent) when
`creditLimit` is set. `/cards/sync` pulls balances from a connected Plaid account
(returns `{ reason: "no-plaid-connection" }` if none).

---

## 5. Statements (PDF upload)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/statements/upload` | user | `multipart/form-data`, field `statement` (or `pdf`), a PDF file | `{ extracted, rawPreview, needsReview: true }` |

`extracted`: `{ statementBalance, minimumPayment, dueDate, apr }` (any may be
`null`). Send as `FormData`; **don't** set `Content-Type` manually (the browser
sets the multipart boundary). Show a review screen with `extracted` and let the
user confirm/correct, then create a card via `POST /cards`.

```ts
const fd = new FormData();
fd.append('statement', file); // file: File from <input type="file">
await fetch(`${API}/api/statements/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
```

---

## 6. Optimizer suite (deterministic engine)

All under `/optimizer`, all `POST`, all `user` auth. Each uses the user's stored
**credit** cards when `cards` is omitted.

### 6a. Recommend (allocate a payment)
`POST /optimizer/recommend` · body `{ maxPayment, cards? }`
→ `{ strategy, plan: [{ cardName, recommendedPayment, reason, ... }], riskScores, warning, totalMinimum, remaining }`

### 6b. Payday Rescue Plan (dated plan)
`POST /optimizer/rescue` · body `{ paycheckDate, paycheckAmount, cashBuffer?, currentCash?, lateFeePerCard?, cards? }`
→ `{ strategy, actions: [{ cardName, amount, date, when: "today"|"payday", type, reason }], warnings, summary: { lateFeesAvoided, lateFeeAmountAvoided, debtFreeDate, monthsToDebtFree, interestSavedVsMinimums, monthsSavedVsMinimums, ... } }`

### 6c. What-if simulator
`POST /optimizer/simulate` · body `{ scenarios: [...], monthlyPayment?, cards? }`
Each scenario: `{ label, extraMonthly?, monthlyPayment?, lumpSum?, removeCardIds?, cardOverrides? }`
(`cardOverrides` = `{ "<cardId>": { apr?, balance?, minimumPayment? } }`)
→ `{ baseline, scenarios: [{ label, debtFreeDate, monthsToDebtFree, totalInterest, vsBaseline: { monthsSaved, interestSaved } }], bestScenario }`

### 6d. Balance-transfer evaluator
`POST /optimizer/balance-transfer` · body `{ amount | sourceCardId, sourceApr?, monthlyPayment, offer: { promoApr, promoMonths, transferFeePct, postPromoApr? } }`
→ `{ transferFee, transferredBalance, stay, transfer, savings, breakEvenMonths, recommendation: "transfer"|"stay", warnings }`

---

## 7. AI explanation (plain-English narration)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/ai/explain` | user | `{ kind, result, cards? }` **or** legacy `{ optimizerResult }` | `{ explanation, source: "ai"\|"fallback", model? }` |

`kind` ∈ `optimizer` · `rescue` · `simulate` · `balanceTransfer`. Pass the
corresponding result object from §6 as `result`. Always returns an
`explanation` (deterministic fallback when AI is unavailable). Rate-limited.

---

## 8. Plaid (Connect bank)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/plaid/create-link-token` | user | – | `{ link_token, demo? }` |
| POST | `/plaid/exchange-public-token` | user | `{ public_token }` | `{ connected: true }` |
| POST | `/plaid/sandbox/connect` | user | `{ institution_id? }` | `{ connected: true, accounts: [...] }` |
| GET | `/plaid/accounts` | user | – | `{ accounts: [...], demo }` |
| GET | `/plaid/transactions` | user | – | `{ transactions: [...], demo }` |

Flow: get `link_token` → open Plaid Link in the client → on success Plaid gives
you a `public_token` → exchange it. With no Plaid keys configured the API returns
seeded demo data (`demo: true`). **Send a real Plaid Link `public_token`** — a
placeholder will be rejected with a clean `400`.

**Sandbox shortcut:** in sandbox mode, `POST /plaid/sandbox/connect` mints +
exchanges a token and links a demo bank in one call (no Plaid Link UI) — ideal
for testing/demo. After connecting, call `/cards/sync` to import the accounts as
cards. (Sandbox transactions can take ~30s to become available; until then
`/plaid/transactions` returns `demo: true`.)

---

## 9. Dashboard

| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| GET | `/dashboard` | user | `?rangeDays=30` (1–365) | see below |

```
{
  summary: { income, spending, net, rangeDays, startDate, endDate },
  spendingVsEarning: [{ month, income, spending }],      // 6-month series (graph 1)
  categorizedSpending: [{ category, amount, percent }],  // (graph 2)
  upcomingDueDates: [{ cardName, dueDate, daysUntil, minimumPayment, balance }],
  payday: { lastPaydayDate, lastAmount, nextPaydayEstimate, daysUntil } | null,
  totals: { creditCardDebt, cardsDueSoon }
}
```

---

## 10. Alerts & Progress

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/alerts` | user | `{ alerts: [{ type, severity, title, message, cardId?, dueDate?, daysUntil? }], counts: { critical, warning, info } }` |
| GET | `/progress` | user | `{ currentDebt, totalCreditLimit, overallUtilization, history: [{ date, totalBalance, utilization }], debtChange, milestones: [{ type, title, achieved, detail }], interestSaved: { projectedVsMinimums, assumptions } }` |

`alerts.severity` ∈ `critical` · `warning` · `info` (sorted, color them
red/amber/blue). `progress.history` drives the "debt going down" chart; calling
`/progress` also records today's snapshot.

---

## 11. Help, Terms & Privacy (public — no auth)

| Method | Path | Response |
|---|---|---|
| GET | `/help` | `{ title, articles: [{ id, title, body }] }` |
| GET | `/legal/terms` | `{ title, version, effectiveDate, sections: [{ heading, body }] }` |
| GET | `/legal/privacy` | same shape as terms |

---

## 12. Chatbot & Support (Help + escalation)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/chatbot/ask` | user | `{ question }` | `{ answer, escalatable, sources, confidence }` |
| POST | `/support/escalate` | user | `{ subject, message, transcript? }` | `{ ticket, adminNotified, fallback }` |
| POST | `/support/tickets` | user | `{ subject, message }` | `{ ticket }` |
| GET | `/support/tickets` | user | – | `{ tickets: [...] }` |
| GET | `/support/tickets/:id` | user | – | `{ ticket }` |
| POST | `/support/tickets/:id/messages` | user | `{ message }` | `{ ticket, adminNotified }` |

If `chatbot/ask` returns `escalatable: true`, offer a "talk to a human" button →
`POST /support/escalate` (optionally pass the chat `transcript` as
`[{ sender: "user"|"bot", body }]`). The ticket's `messages` array is the private
relay thread; `sender` ∈ `user` · `bot` · `admin`. Posting a message reopens a
resolved ticket.

---

## 13. Admin CRM (admin only, TOTP-gated)

CRM **data** routes require a two-step auth: a normal admin token **plus** a
short-lived TOTP step-up token. Flow:

1. `POST /auth/login` as an admin → `token` (the **admin token**).
2. First time only — enroll TOTP:
   - `POST /admin/totp/setup` (admin token) → `{ secret, otpauthUrl, qrDataUrl }`. Render `qrDataUrl` (a data-URL image) for the user to scan in Google Authenticator / Authy.
   - `POST /admin/totp/enable` `{ token: <6-digit code> }` → `{ enabled: true }`.
3. Each session — step up:
   - `POST /admin/totp/verify` `{ token: <6-digit code> }` → `{ crmToken, expiresIn }` (the **CRM token**, ~15 min).
4. Call CRM data routes with `Authorization: Bearer <crmToken>`.

| Method | Path | Token | Notes |
|---|---|---|---|
| GET | `/admin/totp/status` | admin | `{ enabled, required }` |
| POST | `/admin/totp/setup` | admin | returns secret + QR |
| POST | `/admin/totp/enable` | admin | confirm enrollment |
| POST | `/admin/totp/verify` | admin | → `crmToken` |
| GET | `/admin/users` | **crm** | `{ users: [{ ...user, cardCount }] }` |
| GET | `/admin/users/:id` | **crm** | `{ user: { ...user, cardCount, ticketCount, lastLoginAt, lastLoginIp } }` |
| PATCH | `/admin/users/:id` | **crm** | edit `{ name, mobile, email, role, subscriptionPlan, profileImageUrl }` |
| DELETE | `/admin/users/:id` | **crm** | cascade delete |
| GET | `/admin/tickets` | **crm** | `?status=open\|pending\|resolved` |
| PATCH | `/admin/tickets/:id` | **crm** | `{ status?, reply? }` (reply notifies the user) |

Responses for the gate: not an admin → `403`; admin without TOTP enrolled →
`403` ("set up an authenticator"); admin with a **normal** token (no step-up) →
`401` ("CRM step-up required"). When CRM calls start returning `401`, re-run
`/admin/totp/verify` to refresh the `crmToken`.

---

## 14. Not for the frontend

`GET /api/cron/card-sync` and `GET /api/cron/alerts-digest` are server-to-server
(triggered by Vercel Cron with a `CRON_SECRET` bearer). Don't call them from the
client. `GET /api/health` is for monitoring.

---

## 15. Tab → endpoint cheat sheet

| App area | Primary endpoints |
|---|---|
| **Login / Signup** | `/auth/signup`, `/auth/login` |
| **Dashboard** | `/dashboard`, `/alerts`, `/progress` |
| **Optimizer** | `/optimizer/recommend`, `/optimizer/rescue`, `/optimizer/simulate`, `/optimizer/balance-transfer`, `/ai/explain` |
| **Cards (Credit/Debit)** | `/cards`, `/cards?type=…`, `/cards/:id`, `/statements/upload`, `/cards/sync`, `/plaid/*` |
| **My Profile** | `/profile` (GET/PATCH/DELETE) |
| **Help** | `/help`, `/legal/terms`, `/legal/privacy`, `/chatbot/ask`, `/support/*` |
| **Admin CRM** | `/admin/totp/*`, `/admin/users*`, `/admin/tickets*` |
