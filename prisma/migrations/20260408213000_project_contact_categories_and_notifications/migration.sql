-- Project contacts: typed categories + notification cooldown storage.
CREATE TYPE "ProjectContactCategory" AS ENUM ('DECISION_MAKER', 'CONTRACTOR', 'VENUE', 'OTHER');

ALTER TABLE "ProjectContact"
ADD COLUMN "category" "ProjectContactCategory" NOT NULL DEFAULT 'DECISION_MAKER';

CREATE TABLE "ProjectNotificationCooldown" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "blockKey" TEXT NOT NULL,
  "muteUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectNotificationCooldown_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectNotificationCooldown_projectId_blockKey_key"
ON "ProjectNotificationCooldown"("projectId", "blockKey");

CREATE INDEX "ProjectNotificationCooldown_projectId_idx"
ON "ProjectNotificationCooldown"("projectId");

CREATE INDEX "ProjectNotificationCooldown_projectId_muteUntil_idx"
ON "ProjectNotificationCooldown"("projectId", "muteUntil");

ALTER TABLE "ProjectNotificationCooldown"
ADD CONSTRAINT "ProjectNotificationCooldown_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
