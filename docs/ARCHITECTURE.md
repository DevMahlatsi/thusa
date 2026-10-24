# Architecture

Owner app (Next.js) → API routes → PostgreSQL (Prisma)
Scheduler (Vercel Cron → /api/cron/daily; pg-boss later) → payments adapter → Stitch sandbox (FNB later)
Provider webhook → /api/webhooks/payments → verify signature → dedupe → match → ledger → notify
Messaging adapter → WhatsApp/SMS (stubbed in dev)

## Folders
- src/app/            Next.js routes and pages
- src/payments/       adapter.ts (interface), stitch.ts, fnb.ts (later), mock.ts
- src/messaging/      adapter + templates/{en,zu,st,tn}
- src/jobs/           daily job (payday requests, reminders, balance requests), run by Vercel Cron via
                      /api/cron/daily. pg-boss later, on a host that can keep a worker running.
- src/lib/            auth (OTP), db, validation, logger (masks PII)
- prisma/             schema.prisma, seed.ts (demo account)
- tests/              unit + integration (webhooks, idempotency, tenant isolation)

## Payment adapter interface
createPaymentRequest({ payerId, amountCents, reference, idempotencyKey })
verifyAccount({ accountNumber, branchCode, idNumberOrName })
parseWebhook(rawBody, headers) → verified event or throws
getPaymentStatus(reference)

## Core tables
Business, User, Payer, Schedule, Collection, BalanceRequest, LedgerEntry, WebhookEvent (unique eventId),
Message (every message to a parent, unique dedupe key), AuditLog
