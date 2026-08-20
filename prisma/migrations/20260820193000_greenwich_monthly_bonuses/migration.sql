CREATE TYPE "GreenwichMonthlyBonusStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED');
CREATE TYPE "GreenwichMonthlyBonusEventType" AS ENUM ('AWARDED', 'REDEEMED', 'RESTORED', 'EXPIRED');

CREATE TABLE "GreenwichMonthlyBonus" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "earnedMonth" TIMESTAMP(3) NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "status" "GreenwichMonthlyBonusStatus" NOT NULL DEFAULT 'ACTIVE',
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemedAt" TIMESTAMP(3),
  "restoredAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GreenwichMonthlyBonus_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GreenwichMonthlyBonus_discountPercent_check" CHECK ("discountPercent" BETWEEN 5 AND 12),
  CONSTRAINT "GreenwichMonthlyBonus_validity_check" CHECK ("validUntil" > "validFrom")
);

CREATE UNIQUE INDEX "GreenwichMonthlyBonus_earnedMonth_key" ON "GreenwichMonthlyBonus"("earnedMonth");
CREATE UNIQUE INDEX "GreenwichMonthlyBonus_code_key" ON "GreenwichMonthlyBonus"("code");
CREATE INDEX "GreenwichMonthlyBonus_userId_status_validFrom_validUntil_idx"
  ON "GreenwichMonthlyBonus"("userId", "status", "validFrom", "validUntil");
CREATE INDEX "GreenwichMonthlyBonus_status_validUntil_idx"
  ON "GreenwichMonthlyBonus"("status", "validUntil");

ALTER TABLE "GreenwichMonthlyBonus" ADD CONSTRAINT "GreenwichMonthlyBonus_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "greenwichMonthlyBonusId" TEXT;
CREATE UNIQUE INDEX "Order_greenwichMonthlyBonusId_key" ON "Order"("greenwichMonthlyBonusId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_greenwichMonthlyBonusId_fkey"
  FOREIGN KEY ("greenwichMonthlyBonusId") REFERENCES "GreenwichMonthlyBonus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GreenwichMonthlyBonusEvent" (
  "id" TEXT NOT NULL,
  "bonusId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "GreenwichMonthlyBonusEventType" NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "orderId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GreenwichMonthlyBonusEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GreenwichMonthlyBonusEvent_sourceKey_key" ON "GreenwichMonthlyBonusEvent"("sourceKey");
CREATE INDEX "GreenwichMonthlyBonusEvent_userId_createdAt_idx"
  ON "GreenwichMonthlyBonusEvent"("userId", "createdAt");
CREATE INDEX "GreenwichMonthlyBonusEvent_bonusId_createdAt_idx"
  ON "GreenwichMonthlyBonusEvent"("bonusId", "createdAt");
CREATE INDEX "GreenwichMonthlyBonusEvent_orderId_idx" ON "GreenwichMonthlyBonusEvent"("orderId");

ALTER TABLE "GreenwichMonthlyBonusEvent" ADD CONSTRAINT "GreenwichMonthlyBonusEvent_bonusId_fkey"
  FOREIGN KEY ("bonusId") REFERENCES "GreenwichMonthlyBonus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreenwichMonthlyBonusEvent" ADD CONSTRAINT "GreenwichMonthlyBonusEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreenwichMonthlyBonusEvent" ADD CONSTRAINT "GreenwichMonthlyBonusEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
