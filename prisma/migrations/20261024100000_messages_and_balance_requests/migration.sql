-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('PAYMENT_REQUEST', 'REMINDER', 'BALANCE_REQUEST');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'NOT_DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "BalanceRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "forPaidCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "paymentUrl" TEXT,
    "sendingSince" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "template" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "channel" TEXT NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "note" TEXT,
    "sentByUserId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalanceRequest_reference_key" ON "BalanceRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceRequest_idempotencyKey_key" ON "BalanceRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BalanceRequest_businessId_idx" ON "BalanceRequest"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceRequest_collectionId_forPaidCents_key" ON "BalanceRequest"("collectionId", "forPaidCents");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceRequest_provider_providerRequestId_key" ON "BalanceRequest"("provider", "providerRequestId");

-- CreateIndex
CREATE INDEX "Message_businessId_createdAt_idx" ON "Message"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_collectionId_idx" ON "Message"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_businessId_dedupeKey_key" ON "Message"("businessId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "BalanceRequest" ADD CONSTRAINT "BalanceRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceRequest" ADD CONSTRAINT "BalanceRequest_collectionId_businessId_fkey" FOREIGN KEY ("collectionId", "businessId") REFERENCES "Collection"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_collectionId_businessId_fkey" FOREIGN KEY ("collectionId", "businessId") REFERENCES "Collection"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma can't express these.
ALTER TABLE "BalanceRequest" ADD CONSTRAINT "BalanceRequest_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "BalanceRequest" ADD CONSTRAINT "BalanceRequest_paid_non_negative" CHECK ("forPaidCents" >= 0);
