# thusa.

**Help, on payday.** Thusa collects fees for small businesses with regular customers on each
customer's payday: weekly, fortnightly or monthly, from any bank, in English, isiZulu, Sesotho
or Setswana. We're starting with crèches and early learning centres.

Built for the **FNB App of the Year Hackathon 2026** by **Thusa Labs**
(Challenge: Financial inclusion and money confidence).

## Live demo

- **URL:** https://mythusa.vercel.app
- **Log in:** click **Try the live demo**, then use
  - Phone number: `060 000 0000`
  - Code: `123456`

The demo account uses sandbox data only. Payments run through the Stitch sandbox (no real money
moves), and messages to parents are shown in the app, not sent. The account resets daily at 07:00.

### What to try

1. **Overview:** expected vs received, Who's paid, and "This week in plain words".
2. **Parents → Add parent:** choose **Weekly** and a payday, and pick a message language. Or open the
   invite under **Invite links**, click **See what the parent sees**, fill it in as the parent, then come back
   to **Parents** and **Approve** it.
3. **Collections:** click **Send request**, pay on the Stitch sandbox page, and watch the row turn **Paid**.
4. **Messages:** see payment requests and reminders in isiZulu, Sesotho and Setswana.
5. **Overview:** switch the AI summary between languages.

## Why Thusa

Many parents are paid weekly or from several small income sources, but fees are billed monthly.
So money arrives late and in pieces, and owners spend their evenings chasing it. Thusa asks each
customer to pay on their own payday, matches every payment automatically and sends polite
reminders. Parents never pay Thusa fees, and there are no late fees.

## Features

- **Payday-based schedules:** weekly, fortnightly or monthly, per customer (for example "every Wednesday").
- **Parents add themselves** from a single-use invite link: they choose weekly, fortnightly or monthly
  (the amount is worked out by Thusa), their payday and language, and agree to messages. The owner approves.
- **Payment links from any bank** through the Stitch sandbox (FNB APIs next).
- **Automatic matching:** a payment is marked **Paid** only from a verified provider event.
- **Part-payments** with the balance tracked.
- **Polite reminders** in four languages, from fixed templates. No late fees.
- **Customer insights:** reliability badges (Reliable, Sometimes late, Needs support) and
  suggestions for the owner.
- **"This week in plain words":** an AI-written weekly summary for the owner in four languages.
  It sees totals and first names only, and it never sends messages or moves money.
- **Phone + OTP login**, with no passwords.

## Tech stack

- TypeScript (strict), Next.js App Router (mobile-first PWA), Node.js 22
- PostgreSQL via Prisma, with every query scoped to the logged-in business
- Zod validation on every API input
- pg-boss for scheduled payment requests, reminders and retries
- Stitch.money sandbox behind a payments adapter (`src/payments/`), ready for FNB APIs
- OpenAI Responses API (`gpt-5.6-luna`, low reasoning effort) for the owner summary
- Vitest for tests, with GitHub Actions CI (lint, type check, tests, Gitleaks, npm audit)
- Hosting: Vercel + Neon for the demo; AWS Cape Town (af-south-1) planned for production

## Run locally

Requires Node 22+ and Docker (for Postgres).

1. `cp .env.example .env` and set `SESSION_SECRET`, for example:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. `npm install`
3. `npm run db:up` (Postgres on port 5432), then `npx prisma migrate dev`
4. `npm run dev` and open http://localhost:3000

In development no SMS is sent. Login codes appear at http://localhost:3000/dev/outbox
(never in logs).

Optional: to enable the AI summary locally, set `OPENAI_API_KEY`, `OPENAI_MODEL`,
`OPENAI_REASONING_EFFORT` and `AI_SUMMARY_ENABLED=true` in `.env`. Without them, the dashboard
shows the rule-based insights instead.

## Tests

`npm test` runs the unit tests. To include the database integration tests (OTP flow, sessions,
tenant isolation):

```sh
docker compose exec db psql -U thusa -c "CREATE DATABASE thusa_test"   # once
export TEST_DATABASE_URL=postgresql://thusa:thusa_local_only@localhost:5432/thusa_test
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
npm test
```

## Security

- Webhooks: the signature is verified first, then events are deduplicated by ID, then processed.
- Money is stored as integer cents, and amounts are always calculated on the server.
- Every database query is scoped to the logged-in business, with tests proving isolation.
- Phone numbers, account numbers, codes and tokens are masked in logs.
- No secrets in the repo: keys come from environment variables, and Gitleaks runs in CI.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full checklist.

## Docs

- [`docs/PRODUCT.md`](docs/PRODUCT.md): problem, users, features and pricing
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): data flow, folders and the payments adapter
- [`docs/SECURITY.md`](docs/SECURITY.md): security checklist from our SSDLC submission
- [`docs/AI.md`](docs/AI.md): rules for the AI summary

## Team

Thusa Labs. "Thusa" means *help* in Sesotho and Setswana.