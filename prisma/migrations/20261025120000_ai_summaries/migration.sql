-- CreateEnum
CREATE TYPE "AiSummaryStatus" AS ENUM ('PENDING', 'OK', 'FAILED');

-- CreateTable
CREATE TABLE "AiSummary" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "periodStart" DATE NOT NULL,
    "status" "AiSummaryStatus" NOT NULL,
    "text" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSummary_businessId_createdAt_idx" ON "AiSummary"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AiSummary_businessId_language_periodStart_createdAt_idx" ON "AiSummary"("businessId", "language", "periodStart", "createdAt");

-- AddForeignKey
ALTER TABLE "AiSummary" ADD CONSTRAINT "AiSummary_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An OK row always has text, and only an OK row does.
ALTER TABLE "AiSummary" ADD CONSTRAINT "AiSummary_text_only_when_ok" CHECK (("status" = 'OK') = ("text" IS NOT NULL));
