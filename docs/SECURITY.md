# Security checklist (from our SSDLC submission)

- OTP: crypto-random, stored hashed, 5-min expiry, single use, lock after 3 fails, rate-limited
- Sessions: secure, HTTP-only, SameSite cookies; server-side authorisation on every endpoint
- Roles: OWNER, STAFF, READONLY
- Zod validation on all inputs; Prisma only (no raw string SQL)
- Row-level security by businessId; tests prove one owner cannot see another's payers
- Bank account numbers encrypted at field level; masked in UI and logs
- Webhooks: signature verification, event-ID dedupe, status reconfirmation
- Idempotency keys on all payment requests; append-only ledger
- Bank details locked after verification; changes need fresh OTP
- Fixed message templates; "Thusa will never ask for your PIN or password"
- Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy; CSRF protection
- Rate limits on OTP and payment requests; daily caps per business
- Secrets only in env / secrets manager; Gitleaks in CI
- Audit log for sensitive actions
