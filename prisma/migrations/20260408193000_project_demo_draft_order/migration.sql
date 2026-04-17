-- Demo / draft requisition inside project card.

ALTER TYPE "ProjectActivityKind"
ADD VALUE IF NOT EXISTS 'PROJECT_DRAFT_ORDER_UPDATED';

ALTER TYPE "ProjectActivityKind"
ADD VALUE IF NOT EXISTS 'PROJECT_DRAFT_ORDER_MATERIALIZED';

CREATE TABLE "ProjectDraftOrder" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT,
  "comment" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectDraftOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectDraftOrderLine" (
  "id" TEXT NOT NULL,
  "draftOrderId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "itemId" TEXT NOT NULL,
  "itemNameSnapshot" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "comment" TEXT,
  "periodGroup" TEXT,
  "pricePerDaySnapshot" DECIMAL(14,2),
  "lastAvailableQty" INTEGER,
  "lastAvailabilityNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectDraftOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectDraftOrder_projectId_key"
ON "ProjectDraftOrder"("projectId");

CREATE INDEX "ProjectDraftOrder_projectId_idx"
ON "ProjectDraftOrder"("projectId");

CREATE INDEX "ProjectDraftOrderLine_draftOrderId_sortOrder_idx"
ON "ProjectDraftOrderLine"("draftOrderId", "sortOrder");

CREATE INDEX "ProjectDraftOrderLine_itemId_idx"
ON "ProjectDraftOrderLine"("itemId");

ALTER TABLE "ProjectDraftOrder"
ADD CONSTRAINT "ProjectDraftOrder_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectDraftOrder"
ADD CONSTRAINT "ProjectDraftOrder_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectDraftOrder"
ADD CONSTRAINT "ProjectDraftOrder_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectDraftOrderLine"
ADD CONSTRAINT "ProjectDraftOrderLine_draftOrderId_fkey"
FOREIGN KEY ("draftOrderId") REFERENCES "ProjectDraftOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectDraftOrderLine"
ADD CONSTRAINT "ProjectDraftOrderLine_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
