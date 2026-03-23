-- Enums for inventory audit.
CREATE TYPE "InventoryAuditRunKind" AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE "InventoryAuditSeverity" AS ENUM ('OK', 'WARNING', 'CRITICAL', 'FAILED');

-- Audit run header.
CREATE TABLE "InventoryAuditRun" (
  "id" TEXT NOT NULL,
  "kind" "InventoryAuditRunKind" NOT NULL,
  "severity" "InventoryAuditSeverity" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "summaryJson" JSONB,
  "errorText" TEXT,
  "createdByUserId" TEXT,
  CONSTRAINT "InventoryAuditRun_pkey" PRIMARY KEY ("id")
);

-- Per-item results.
CREATE TABLE "InventoryAuditItemResult" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "severity" "InventoryAuditSeverity" NOT NULL,
  "expectedJson" JSONB NOT NULL,
  "actualJson" JSONB NOT NULL,
  "deltaJson" JSONB NOT NULL,
  "explanationJson" JSONB,
  CONSTRAINT "InventoryAuditItemResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryAuditRun_startedAt_idx" ON "InventoryAuditRun"("startedAt");
CREATE INDEX "InventoryAuditRun_severity_startedAt_idx" ON "InventoryAuditRun"("severity","startedAt");
CREATE INDEX "InventoryAuditItemResult_runId_severity_idx" ON "InventoryAuditItemResult"("runId","severity");
CREATE INDEX "InventoryAuditItemResult_itemId_idx" ON "InventoryAuditItemResult"("itemId");

ALTER TABLE "InventoryAuditRun"
ADD CONSTRAINT "InventoryAuditRun_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryAuditItemResult"
ADD CONSTRAINT "InventoryAuditItemResult_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "InventoryAuditRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryAuditItemResult"
ADD CONSTRAINT "InventoryAuditItemResult_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "Item"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
