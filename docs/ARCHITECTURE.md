# Architecture

Owner app (Next.js) → API routes → PostgreSQL (Prisma)
Scheduler (pg-boss) → payments adapter → Stitch sandbox (FNB later)
Provider webhook → /api/webhooks/payments → verify signature → dedupe → match → ledger → notify
Messaging adapter → WhatsApp/SMS (stubbed in dev)

## Folders
- src/app/            Next.js routes and pages
- src/payments/       adapter.ts (interface), stitch.ts, fnb.ts (later), mock.ts
- src/messaging/      adapter + templates/{en,zu,st,tn}
- src/jobs/           pg-boss jobs: schedule-requests, send-reminders, retry
- src/lib/            auth (OTP), db, validation, logger (masks PII)
- prisma/             schema.prisma, seed.ts (demo account)
- tests/              unit + integration (webhooks, idempotency, tenant isolation)

## Payment adapter interface
createPaymentRequest({ payerId, amountCents, reference, idempotencyKey })
verifyAccount({ accountNumber, branchCode, idNumberOrName })
parseWebhook(rawBody, headers) → verified event or throws
getPaymentStatus(reference)

## Core tables
Business, User, Payer, Schedule, Collection, LedgerEntry, WebhookEvent (unique eventId), AuditLog
