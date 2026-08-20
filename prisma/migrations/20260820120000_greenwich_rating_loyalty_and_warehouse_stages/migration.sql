ALTER TYPE "GreenwichRatingEventType"
  ADD VALUE IF NOT EXISTS 'CONFIRMATION_RESPONDED';

ALTER TABLE "GreenwichRatingPolicy"
  ADD COLUMN IF NOT EXISTS "confirmationResponseReward" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "overduePenaltyPerDay" INTEGER NOT NULL DEFAULT -5,
  ADD COLUMN IF NOT EXISTS "overduePenaltyCap" INTEGER NOT NULL DEFAULT -25,
  ADD COLUMN IF NOT EXISTS "perfectReturnReward" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "repairPenaltyPerUnit" INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS "lostPenaltyPerUnit" INTEGER NOT NULL DEFAULT -3,
  ADD COLUMN IF NOT EXISTS "incidentPenaltyCap" INTEGER NOT NULL DEFAULT -20;

CREATE TABLE "GreenwichRatingTier" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minScore" INTEGER NOT NULL,
  "discountPercent" DECIMAL(5,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GreenwichRatingTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GreenwichRatingTier_policyId_minScore_key"
  ON "GreenwichRatingTier"("policyId", "minScore");
CREATE INDEX "GreenwichRatingTier_policyId_sortOrder_idx"
  ON "GreenwichRatingTier"("policyId", "sortOrder");

ALTER TABLE "GreenwichRatingTier"
  ADD CONSTRAINT "GreenwichRatingTier_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "GreenwichRatingPolicy"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "GreenwichRatingTier" (
  "id", "policyId", "name", "minScore", "discountPercent", "sortOrder", "updatedAt"
) VALUES
  ('rating-tier-start', 'default', 'Старт', 0, 10, 0, NOW()),
  ('rating-tier-stable', 'default', 'Стабильный', 60, 20, 1, NOW()),
  ('rating-tier-reliable', 'default', 'Надёжный', 75, 25, 2, NOW()),
  ('rating-tier-premium', 'default', 'Премиум', 90, 30, 3, NOW())
ON CONFLICT ("policyId", "minScore") DO NOTHING;
