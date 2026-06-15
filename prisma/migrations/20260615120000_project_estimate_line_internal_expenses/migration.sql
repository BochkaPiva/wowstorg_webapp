-- Additional internal expense rows for project estimate lines.
CREATE TABLE "ProjectEstimateLineInternalExpense" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" VARCHAR(500),
    "cost" DECIMAL(14,2),
    "paymentMethod" VARCHAR(40),
    "paymentStatus" VARCHAR(120),
    "contractorNote" TEXT,
    "contractorRequisites" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEstimateLineInternalExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectEstimateLineInternalExpense_lineId_sortOrder_idx" ON "ProjectEstimateLineInternalExpense"("lineId", "sortOrder");

ALTER TABLE "ProjectEstimateLineInternalExpense"
ADD CONSTRAINT "ProjectEstimateLineInternalExpense_lineId_fkey"
FOREIGN KEY ("lineId") REFERENCES "ProjectEstimateLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
