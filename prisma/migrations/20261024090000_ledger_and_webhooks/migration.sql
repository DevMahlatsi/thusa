-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('PAYMENT');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntry_collectionId_idx" ON "LedgerEntry"("collectionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_businessId_createdAt_idx" ON "LedgerEntry"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_provider_providerPaymentId_key" ON "LedgerEntry"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_collectionId_businessId_fkey" FOREIGN KEY ("collectionId", "businessId") REFERENCES "Collection"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma can't express these.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payment_positive" CHECK ("kind" <> 'PAYMENT' OR "amountCents" > 0);

-- The ledger is append-only: corrections are new entries. TRUNCATE (tests only) is not blocked.
CREATE FUNCTION "LedgerEntry_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is append-only: add a correction entry instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LedgerEntry_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "LedgerEntry_append_only"();
