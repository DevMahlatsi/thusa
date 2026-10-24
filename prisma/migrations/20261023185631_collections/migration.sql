-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "rhythm" "Rhythm" NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'PENDING',
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

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_reference_key" ON "Collection"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_idempotencyKey_key" ON "Collection"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Collection_businessId_dueDate_idx" ON "Collection"("businessId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_payerId_dueDate_key" ON "Collection"("payerId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_provider_providerRequestId_key" ON "Collection"("provider", "providerRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_id_businessId_key" ON "Collection"("id", "businessId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_payerId_businessId_fkey" FOREIGN KEY ("payerId", "businessId") REFERENCES "Payer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma can't express CHECK constraints. Backstops the rules in src/lib/collections.ts.
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_paidCents_not_negative" CHECK ("paidCents" >= 0);
