-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PayerInvite" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "monthlyAmountCents" INTEGER NOT NULL,
    "allowedRhythms" "Rhythm"[],
    "status" "InviteStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "parentName" TEXT,
    "phoneEncrypted" TEXT,
    "language" "Language",
    "rhythm" "Rhythm",
    "payday" INTEGER,
    "amountCents" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "payerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingConsent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayerInvite_tokenHash_key" ON "PayerInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PayerInvite_payerId_key" ON "PayerInvite"("payerId");

-- CreateIndex
CREATE INDEX "PayerInvite_businessId_status_createdAt_idx" ON "PayerInvite"("businessId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayerInvite_id_businessId_key" ON "PayerInvite"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConsent_inviteId_key" ON "MessagingConsent"("inviteId");

-- CreateIndex
CREATE INDEX "MessagingConsent_businessId_idx" ON "MessagingConsent"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConsent_inviteId_businessId_key" ON "MessagingConsent"("inviteId", "businessId");

-- CreateIndex
CREATE INDEX "RateLimitHit_bucket_keyHash_createdAt_idx" ON "RateLimitHit"("bucket", "keyHash", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitHit_createdAt_idx" ON "RateLimitHit"("createdAt");

-- AddForeignKey
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingConsent" ADD CONSTRAINT "MessagingConsent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingConsent" ADD CONSTRAINT "MessagingConsent_inviteId_businessId_fkey" FOREIGN KEY ("inviteId", "businessId") REFERENCES "PayerInvite"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma can't express CHECK constraints or triggers. Backstops the Zod rules in src/lib/invites.ts.
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_monthlyAmountCents_positive" CHECK ("monthlyAmountCents" > 0);
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_allowedRhythms_not_empty" CHECK (cardinality("allowedRhythms") >= 1);

-- The parent's answers arrive together. Declining clears only the name and phone.
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_answers_together" CHECK (
    ("rhythm" IS NULL) = ("payday" IS NULL)
    AND ("rhythm" IS NULL) = ("amountCents" IS NULL)
    AND ("rhythm" IS NULL) = ("language" IS NULL)
    AND ("rhythm" IS NULL) = ("submittedAt" IS NULL)
);
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_status_matches" CHECK (
    ("status" IN ('OPEN', 'CANCELLED')) = ("submittedAt" IS NULL)
    AND ("status" = 'APPROVED') = ("payerId" IS NOT NULL)
    AND ("status" NOT IN ('SUBMITTED', 'APPROVED') OR ("parentName" IS NOT NULL AND "phoneEncrypted" IS NOT NULL))
);

-- The parent can only pick a rhythm the owner allowed, and never sets the amount: it must be the server's split
-- of the monthly fee (src/lib/fee-split.ts: 12 months' fees over 26 fortnights or 52 weeks, rounded half up).
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_rhythm_allowed" CHECK ("rhythm" IS NULL OR "rhythm" = ANY ("allowedRhythms"));
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_amount_is_split" CHECK (
    "amountCents" IS NULL
    OR "amountCents" = CASE "rhythm"
        WHEN 'MONTHLY' THEN "monthlyAmountCents"
        WHEN 'FORTNIGHTLY' THEN ("monthlyAmountCents"::bigint * 24 + 26) / 52
        WHEN 'WEEKLY' THEN ("monthlyAmountCents"::bigint * 24 + 52) / 104
    END
);
ALTER TABLE "PayerInvite" ADD CONSTRAINT "PayerInvite_payday_in_range" CHECK (
    "payday" IS NULL
    OR ("rhythm" IN ('WEEKLY', 'FORTNIGHTLY') AND "payday" BETWEEN 1 AND 7)
    OR ("rhythm" = 'MONTHLY' AND "payday" BETWEEN 1 AND 31)
);

-- Consent is evidence of what the parent agreed to: never changed or removed. TRUNCATE (tests only) is not blocked.
CREATE FUNCTION "MessagingConsent_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'MessagingConsent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MessagingConsent_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "MessagingConsent"
  FOR EACH ROW EXECUTE FUNCTION "MessagingConsent_append_only"();
