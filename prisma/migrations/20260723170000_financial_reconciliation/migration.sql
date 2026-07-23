CREATE TYPE "FinancialReconciliationMatchStatus" AS ENUM (
  'MATCHED',
  'UNMATCHED',
  'CONFLICT',
  'IGNORED'
);

CREATE TABLE "FinancialReconciliationBatch" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sheetName" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "importedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialReconciliationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialReconciliationRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "externalNumber" TEXT,
  "projectName" TEXT NOT NULL,
  "revenue" DECIMAL(14,2) NOT NULL,
  "expenses" DECIMAL(14,2) NOT NULL,
  "profit" DECIMAL(14,2) NOT NULL,
  "marginPercent" DECIMAL(10,4) NOT NULL,
  "bonusPool" DECIMAL(14,2) NOT NULL,
  "bonusFirst" DECIMAL(14,2) NOT NULL,
  "bonusSecond" DECIMAL(14,2) NOT NULL,
  "sourceLink" TEXT,
  "matchStatus" "FinancialReconciliationMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "matchedEntityType" TEXT,
  "matchedEntityId" TEXT,
  "matchNote" TEXT,
  "originalData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialReconciliationRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialReconciliationBatch_periodStart_periodEnd_idx"
  ON "FinancialReconciliationBatch"("periodStart", "periodEnd");
CREATE INDEX "FinancialReconciliationBatch_createdAt_idx"
  ON "FinancialReconciliationBatch"("createdAt");
CREATE UNIQUE INDEX "FinancialReconciliationRow_batchId_rowNumber_key"
  ON "FinancialReconciliationRow"("batchId", "rowNumber");
CREATE INDEX "FinancialReconciliationRow_batchId_matchStatus_idx"
  ON "FinancialReconciliationRow"("batchId", "matchStatus");
CREATE INDEX "FinancialReconciliationRow_matchedEntityType_matchedEntityId_idx"
  ON "FinancialReconciliationRow"("matchedEntityType", "matchedEntityId");

ALTER TABLE "FinancialReconciliationRow"
  ADD CONSTRAINT "FinancialReconciliationRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "FinancialReconciliationBatch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialReconciliationBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialReconciliationRow" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FinancialReconciliationBatch" FROM anon, authenticated;
REVOKE ALL ON TABLE "FinancialReconciliationRow" FROM anon, authenticated;
