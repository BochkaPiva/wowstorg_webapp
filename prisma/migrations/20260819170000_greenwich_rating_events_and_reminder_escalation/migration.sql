CREATE TYPE "GreenwichRatingEventType" AS ENUM (
  'CONFIRMATION_REPEAT_MISSED',
  'CONFIRMATION_FINAL_MISSED',
  'ADMIN_ADJUSTMENT'
);

ALTER TABLE "GreenwichOrderReminder"
  ADD COLUMN "lastSentAt" TIMESTAMP(3),
  ADD COLUMN "sendCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "GreenwichOrderReminder"
SET "lastSentAt" = "sentAt",
    "sendCount" = CASE WHEN "sentAt" IS NULL THEN 0 ELSE 1 END;

CREATE TABLE "GreenwichRatingPolicy" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "repeatMissedPenalty" INTEGER NOT NULL DEFAULT -1,
  "finalMissedPenalty" INTEGER NOT NULL DEFAULT -2,
  "recoveryGraceDays" INTEGER NOT NULL DEFAULT 14,
  "recoveryDurationDays" INTEGER NOT NULL DEFAULT 60,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GreenwichRatingPolicy_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GreenwichRatingPolicy" (
  "id", "repeatMissedPenalty", "finalMissedPenalty", "recoveryGraceDays", "recoveryDurationDays", "updatedAt"
) VALUES ('default', -1, -2, 14, 60, NOW())
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "GreenwichRatingEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "GreenwichRatingEventType" NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "orderId" TEXT,
  "reminderId" TEXT,
  "recoveryStartsAt" TIMESTAMP(3),
  "recoveryEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GreenwichRatingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GreenwichRatingEvent_sourceKey_key" ON "GreenwichRatingEvent"("sourceKey");
CREATE INDEX "GreenwichRatingEvent_userId_createdAt_idx" ON "GreenwichRatingEvent"("userId", "createdAt");
CREATE INDEX "GreenwichRatingEvent_orderId_idx" ON "GreenwichRatingEvent"("orderId");

ALTER TABLE "GreenwichRatingEvent" ADD CONSTRAINT "GreenwichRatingEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreenwichRatingEvent" ADD CONSTRAINT "GreenwichRatingEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreenwichRatingEvent" ADD CONSTRAINT "GreenwichRatingEvent_reminderId_fkey"
  FOREIGN KEY ("reminderId") REFERENCES "GreenwichOrderReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Старые ручные значения сохраняем как корректировку, но снимаем блокировку автоматики.
INSERT INTO "GreenwichRatingEvent" (
  "id", "userId", "type", "delta", "reason", "sourceKey", "createdAt"
)
SELECT
  'legacy_' || md5(gr."userId"),
  gr."userId",
  'ADMIN_ADJUSTMENT'::"GreenwichRatingEventType",
  gr."score" - LEAST(100, GREATEST(0, 100 + COALESCE(SUM(o."greenwichRatingOverdueDelta" + o."greenwichRatingIncidentsDelta"), 0))),
  'Перенос прежней ручной оценки без остановки автоматического рейтинга',
  'legacy-manual:' || gr."userId",
  NOW()
FROM "GreenwichRating" gr
LEFT JOIN "Order" o ON o."greenwichUserId" = gr."userId"
WHERE gr."manualLocked" = TRUE
GROUP BY gr."userId", gr."score"
ON CONFLICT ("sourceKey") DO NOTHING;

UPDATE "GreenwichRating" SET "manualLocked" = FALSE WHERE "manualLocked" = TRUE;
