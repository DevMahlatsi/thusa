-- CreateEnum
CREATE TYPE "Rhythm" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "Payer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "phoneEncrypted" TEXT NOT NULL,
    "language" "Language",
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "rhythm" "Rhythm" NOT NULL,
    "payday" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payer_businessId_archivedAt_idx" ON "Payer"("businessId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payer_id_businessId_key" ON "Payer"("id", "businessId");

-- CreateIndex
CREATE INDEX "Schedule_businessId_idx" ON "Schedule"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_payerId_businessId_key" ON "Schedule"("payerId", "businessId");

-- AddForeignKey
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_payerId_businessId_fkey" FOREIGN KEY ("payerId", "businessId") REFERENCES "Payer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma can't express CHECK constraints. Backstops the Zod rules in src/lib/payers.ts.
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_payday_in_range" CHECK (
    ("rhythm" IN ('WEEKLY', 'FORTNIGHTLY') AND "payday" BETWEEN 1 AND 7)
    OR ("rhythm" = 'MONTHLY' AND "payday" BETWEEN 1 AND 31)
);
