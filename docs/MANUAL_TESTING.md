# SpendPilot — Manual Testing Guide (Postman)

This guide walks through testing the entire backend by hand in Postman. The
collection auto-captures tokens/IDs and even auto-generates TOTP codes, so you
mostly just press **Send** top-to-bottom.

## Files

- `docs/SpendPilot.postman_collection.json` — the requests (11 folders, 50 requests)
- `docs/SpendPilot.postman_environment.json` — variable values for local testing

## 1. Prerequisites

1. **MongoDB running** locally (default `mongodb://127.0.0.1:27017/spend-pilot`).
2. **Start the server with demo data and the AI/Plaid fallbacks** (no external keys needed):

   ```bash
   SEED_DEMO_DATA=true npm start
   ```

   Seeding creates the admin (`admin@spendpilot.app` / `Admin1234!`) and a demo
   user with cards/transactions/tickets. Without it, the **Admin CRM** folder
   has no admin to log in as.

> **macOS port note:** macOS AirPlay Receiver listens on port **5000**. If
> `http://localhost:5000` returns `403 Forbidden` on every call, that's AirPlay,
> not the app. Start the server on another port and update `baseUrl`:
>
> ```bash
> PORT=5077 SEED_DEMO_DATA=true npm start
> ```
> then set the `baseUrl` variable to `http://localhost:5077`.

## 2. Import into Postman

1. **Import** → drag in both JSON files (collection + environment).
2. Top-right environment dropdown → select **SpendPilot Local**.
3. (Optional) edit `baseUrl` if you changed the port.

The collection stores runtime values (`token`, `adminToken`, `crmToken`,
`cardId`, `ticketId`, `totpSecret`) as **collection variables** that test
scripts populate automatically as you go.

## 3. Recommended run order

Run folders in order. Within a folder, top-to-bottom.

| # | Folder | What it proves |
|---|--------|----------------|
| 1 | Health | Server up; DB connected; AI/Plaid mode |
| 2 | Public Content | Terms/Privacy/Help served without auth |
| 3 | Auth | Signup saves `token`; wrong password → 401 |
| 4 | Profile | Get/update; **Delete account is destructive — run last** |
| 5 | Cards | Create credit+debit, sub-tab filters, update, sync, delete |
| 6 | Statements | PDF upload → extracted fields (attach a PDF first) |
| 7 | Optimizer & AI | Deterministic plan + plain-language explanation |
| 8 | Plaid | Link token, exchange (demo), accounts, transactions |
| 9 | Dashboard | Spend-vs-earn series, categories, due dates, payday |
| 10 | Chatbot & Support | RAG answer, escalation, private relay thread |
| 11 | Admin CRM (TOTP) | Admin login → TOTP enroll → step-up → CRM access |

### Notes per folder

**3. Auth** — Run **Signup** once. If you re-run it later you'll get `409`
(email already exists) — just run **Login** instead; both save `token`.

**5. Cards** — *Create credit card* saves `cardId` for the get/update/delete
requests. *Sync cards from Plaid* only returns data after you've run the Plaid
**Exchange public token** request (folder 8); otherwise it returns
`{ reason: "no-plaid-connection" }`.

**6. Statements** — In the *Upload statement* request, open the **Body** tab
(form-data), and on the `statement` row click **Select Files** to attach a
text-based credit-card statement PDF. Response returns
`{ extracted, rawPreview, needsReview: true }`.

**8. Plaid** — With no `PLAID_CLIENT_ID/SECRET` set, these return seeded demo
data with `demo: true`. *Exchange public token* uses the `publicToken` variable
(`demo-public-token`) and stores a demo access token so **Sync cards** and
**Get accounts** work.

**10. Chatbot & Support** — *Escalate to human* saves `ticketId` and (in real
SMTP mode) emails the admin; with `MAIL_ENABLED=false` the email is logged, and
the response shows `adminNotified: false, fallback: true`. *Get ticket thread*
and *Add message* exercise the user side of the private relay.

**11. Admin CRM (TOTP)** — the important security flow:

1. **Admin login** → saves `adminToken`.
2. **TOTP setup** → saves `totpSecret` (and logs the `otpauthUrl`; you could
   scan it in Google Authenticator, but you don't need to — see next).
3. **TOTP enable** and **TOTP verify** have a **pre-request script** that
   computes the current 6-digit code from `totpSecret` automatically, so you can
   just press Send. *Verify* saves `crmToken`.
4. **CRM: list users** uses `crmToken` → `200`. **CRM: list users with NORMAL
   token** uses `adminToken` → `401` (proves the TOTP gate).
5. CRM get/edit/delete user and ticket reply all require `crmToken`.

> The `crmToken` expires in 15 minutes (`CRM_TOKEN_EXPIRES_IN`). If CRM calls
> start returning `401`, re-run **TOTP verify** to mint a fresh one.

## 4. Key negative tests (verify the guards)

| Request | Expected |
|---------|----------|
| Login with wrong password | `401` |
| Any protected route with no `Authorization` | `401` |
| `GET /api/cards?type=prepaid` | `400` (must be credit/debit) |
| Signup with invalid email / missing fields | `400` with `details[]` |
| Update profile email to another user's email | `409` |
| `POST /api/optimizer/recommend` with no credit cards | `400` |
| Chatbot out-of-scope question | `200` with `escalatable: true` |
| Another user's `GET /api/support/tickets/:id` | `404` |
| CRM route with normal admin token (no step-up) | `401` |
| CRM route as a non-admin user | `403` |
| Admin demoting own role / deleting own account via CRM | `403` |
| `DELETE /api/profile` with wrong password | `401` |

## 5. Response shape cheatsheet

```
Health      { ok, service, status, dependencies: { db, ai, plaid }, ... }
Auth        { token, user }
Cards       { cards: [...] } | { card: {...} }
Optimizer   { strategy, plan: [...], riskScores: [...], warning, totalMinimum, remaining }
AI          { explanation, source: "ai"|"fallback" }
Dashboard   { summary, spendingVsEarning, categorizedSpending, upcomingDueDates, payday, totals }
Chatbot     { answer, escalatable, sources, confidence }
Escalate    { ticket, adminNotified, fallback }
TOTP verify { crmToken, expiresIn }
Errors      { error: "message", details?: [...] }   // consistent everywhere
```

## 6. Quick reset

To start clean, drop the database and re-seed:

```bash
mongosh spend-pilot --eval "db.dropDatabase()"
SEED_DEMO_DATA=true npm start
```

Then re-run from folder 3 (Auth → Signup).
