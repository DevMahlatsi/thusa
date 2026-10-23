# Thusa

Help to get paid, on the customer's payday. Payment collection for crèches and small businesses
with regular customers. Built for the FNB App of the Year Hackathon 2026 by Thusa Labs.

## Live demo
- URL: (add before submission)
- Demo login: (add phone number + OTP instructions)

## Run locally
Requires Node 22+ and Docker (for Postgres).

1. `cp .env.example .env` and set `SESSION_SECRET` (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`)
2. `npm install`
3. `npm run db:up` (Postgres on :5432), then `npx prisma migrate dev`
4. `npm run dev` and open http://localhost:3000

In dev no SMS is sent: login codes appear at http://localhost:3000/dev/outbox (never in logs).

## Tests
`npm test` runs unit tests. To include DB integration tests (OTP flow, sessions, tenant isolation):

```sh
docker compose exec db psql -U thusa -c "CREATE DATABASE thusa_test"   # once
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://thusa:thusa_local_only@localhost:5432/thusa_test npm test
```

See `docs/` for product, architecture and security.
