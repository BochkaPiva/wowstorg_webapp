ALTER TYPE "GreenwichRatingEventType" ADD VALUE IF NOT EXISTS 'APPROVAL_WARNING_MISSED';
ALTER TYPE "GreenwichRatingEventType" ADD VALUE IF NOT EXISTS 'RETURN_OVERDUE';
ALTER TYPE "GreenwichRatingEventType" ADD VALUE IF NOT EXISTS 'PERFECT_RETURN';
ALTER TYPE "GreenwichRatingEventType" ADD VALUE IF NOT EXISTS 'RETURN_DAMAGED';
ALTER TYPE "GreenwichRatingEventType" ADD VALUE IF NOT EXISTS 'RETURN_MISSING';

CREATE TYPE "OrderStageReminderAudience" AS ENUM ('GREENWICH', 'WOWSTORG');
CREATE TYPE "OrderStageReminderKind" AS ENUM ('APPROVAL_DUE', 'WAREHOUSE_PREP', 'ISSUE_DUE', 'RETURN_DUE', 'CHECKIN_DUE');
CREATE TYPE "OrderStageReminderStatus" AS ENUM ('PENDING', 'SENT', 'RESOLVED', 'SKIPPED', 'FAILED');

ALTER TABLE "GreenwichRating"
  ADD COLUMN "baseScore" INTEGER NOT NULL DEFAULT 70,
  ALTER COLUMN "score" SET DEFAULT 70;

-- Сотрудники, существовавшие до Loyalty V2, сохраняют историческую базу 100.
UPDATE "GreenwichRating" SET "baseScore" = 100;
INSERT INTO "GreenwichRating" ("userId", "baseScore", "score", "manualLocked", "updatedAt")
SELECT u."id", 100, 100, FALSE, NOW()
FROM "User" u
LEFT JOIN "GreenwichRating" r ON r."userId" = u."id"
WHERE u."role" = 'GREENWICH' AND r."userId" IS NULL;

ALTER TABLE "GreenwichRatingPolicy"
  ADD COLUMN "startingScore" INTEGER NOT NULL DEFAULT 70,
  ADD COLUMN "approvalLeadDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "approvalWarningDays" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "approvalMissedPenalty" INTEGER NOT NULL DEFAULT -3,
  ADD COLUMN "reminderHourOmsk" INTEGER NOT NULL DEFAULT 11;

CREATE TABLE "GreenwichPersonalOffer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "discountPercent" DECIMAL(5,2) NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GreenwichPersonalOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GreenwichPersonalOfferItem" (
  "offerId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  CONSTRAINT "GreenwichPersonalOfferItem_pkey" PRIMARY KEY ("offerId", "itemId")
);

CREATE INDEX "GreenwichPersonalOffer_userId_isActive_startsAt_endsAt_idx"
  ON "GreenwichPersonalOffer"("userId", "isActive", "startsAt", "endsAt");
CREATE INDEX "GreenwichPersonalOffer_createdById_idx" ON "GreenwichPersonalOffer"("createdById");
CREATE INDEX "GreenwichPersonalOfferItem_itemId_idx" ON "GreenwichPersonalOfferItem"("itemId");

ALTER TABLE "GreenwichPersonalOffer" ADD CONSTRAINT "GreenwichPersonalOffer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreenwichPersonalOffer" ADD CONSTRAINT "GreenwichPersonalOffer_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GreenwichPersonalOfferItem" ADD CONSTRAINT "GreenwichPersonalOfferItem_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "GreenwichPersonalOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreenwichPersonalOfferItem" ADD CONSTRAINT "GreenwichPersonalOfferItem_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderLine"
  ADD COLUMN "payMultiplierSnapshot" DECIMAL(5,4),
  ADD COLUMN "greenwichOfferId" TEXT,
  ADD COLUMN "greenwichDiscountPercent" DECIMAL(5,2),
  ADD COLUMN "greenwichDiscountSource" TEXT;
CREATE INDEX "OrderLine_greenwichOfferId_idx" ON "OrderLine"("greenwichOfferId");
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_greenwichOfferId_fkey"
  FOREIGN KEY ("greenwichOfferId") REFERENCES "GreenwichPersonalOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OrderStageReminder" (
  "id" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "recipientId" TEXT,
  "audience" "OrderStageReminderAudience" NOT NULL,
  "kind" "OrderStageReminderKind" NOT NULL,
  "status" "OrderStageReminderStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderStageReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderStageReminder_sourceKey_key" ON "OrderStageReminder"("sourceKey");
CREATE INDEX "OrderStageReminder_status_scheduledFor_idx" ON "OrderStageReminder"("status", "scheduledFor");
CREATE INDEX "OrderStageReminder_orderId_kind_idx" ON "OrderStageReminder"("orderId", "kind");
CREATE INDEX "OrderStageReminder_recipientId_status_idx" ON "OrderStageReminder"("recipientId", "status");
ALTER TABLE "OrderStageReminder" ADD CONSTRAINT "OrderStageReminder_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderStageReminder" ADD CONSTRAINT "OrderStageReminder_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GreenwichRatingEvent" ADD COLUMN "stageReminderId" TEXT;
CREATE INDEX "GreenwichRatingEvent_stageReminderId_idx" ON "GreenwichRatingEvent"("stageReminderId");
ALTER TABLE "GreenwichRatingEvent" ADD CONSTRAINT "GreenwichRatingEvent_stageReminderId_fkey"
  FOREIGN KEY ("stageReminderId") REFERENCES "OrderStageReminder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Старые компоненты заявки один раз переносятся в единый журнал. Тип ADMIN_ADJUSTMENT
-- доступен в старой версии enum и исключается из месячного соревнования.
INSERT INTO "GreenwichRatingEvent" (
  "id", "userId", "type", "delta", "reason", "sourceKey", "orderId", "createdAt"
)
SELECT
  'legacy-overdue-' || o."id", o."greenwichUserId", 'ADMIN_ADJUSTMENT',
  o."greenwichRatingOverdueDelta", 'Перенос исторического результата просрочки',
  'legacy:order:' || o."id" || ':overdue', o."id", o."updatedAt"
FROM "Order" o
WHERE o."greenwichUserId" IS NOT NULL AND o."greenwichRatingOverdueDelta" <> 0
ON CONFLICT ("sourceKey") DO NOTHING;

INSERT INTO "GreenwichRatingEvent" (
  "id", "userId", "type", "delta", "reason", "sourceKey", "orderId", "createdAt"
)
SELECT
  'legacy-incidents-' || o."id", o."greenwichUserId", 'ADMIN_ADJUSTMENT',
  o."greenwichRatingIncidentsDelta", 'Перенос исторического результата приёмки',
  'legacy:order:' || o."id" || ':incidents', o."id", o."updatedAt"
FROM "Order" o
WHERE o."greenwichUserId" IS NOT NULL AND o."greenwichRatingIncidentsDelta" <> 0
ON CONFLICT ("sourceKey") DO NOTHING;
