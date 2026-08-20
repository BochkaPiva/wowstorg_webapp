ALTER TYPE "Condition" ADD VALUE IF NOT EXISTS 'DIRTY' AFTER 'OK';
ALTER TYPE "GreenwichRatingEventType" ADD VALUE IF NOT EXISTS 'RETURN_DIRTY' AFTER 'PERFECT_RETURN';

ALTER TABLE "GreenwichRatingPolicy"
  ADD COLUMN IF NOT EXISTS "dirtyPenaltyPerUnit" INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS "brokenPenaltyPerUnit" INTEGER NOT NULL DEFAULT -4;

ALTER TABLE "GreenwichRatingPolicy"
  ALTER COLUMN "repairPenaltyPerUnit" SET DEFAULT -2,
  ALTER COLUMN "lostPenaltyPerUnit" SET DEFAULT -6;

UPDATE "GreenwichRatingPolicy"
SET "repairPenaltyPerUnit" = -2
WHERE "id" = 'default' AND "repairPenaltyPerUnit" = -1;

UPDATE "GreenwichRatingPolicy"
SET "lostPenaltyPerUnit" = -6
WHERE "id" = 'default' AND "lostPenaltyPerUnit" = -3;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "serviceFeedbackPromptDismissedAt" TIMESTAMP(3);

UPDATE "Order"
SET
  "closedAt" = "updatedAt",
  "serviceFeedbackPromptDismissedAt" = "updatedAt"
WHERE "status" = 'CLOSED' AND "closedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "OrderServiceFeedback" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderServiceFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderServiceFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "OrderServiceFeedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderServiceFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderServiceFeedback_orderId_key" ON "OrderServiceFeedback"("orderId");
CREATE INDEX IF NOT EXISTS "OrderServiceFeedback_rating_createdAt_idx" ON "OrderServiceFeedback"("rating", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderServiceFeedback_authorId_createdAt_idx" ON "OrderServiceFeedback"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderServiceFeedback_createdAt_idx" ON "OrderServiceFeedback"("createdAt");
CREATE INDEX IF NOT EXISTS "Order_greenwichUserId_status_closedAt_idx" ON "Order"("greenwichUserId", "status", "closedAt");
