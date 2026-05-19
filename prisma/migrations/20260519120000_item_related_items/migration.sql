-- CreateEnum
CREATE TYPE "ItemRelationKind" AS ENUM ('REQUIRED', 'RECOMMENDED');

-- CreateTable
CREATE TABLE "ItemRelatedItem" (
    "id" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "relatedItemId" TEXT NOT NULL,
    "kind" "ItemRelationKind" NOT NULL DEFAULT 'RECOMMENDED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultSuggestedQty" INTEGER NOT NULL DEFAULT 1,
    "qtyPerSourceUnit" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemRelatedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemRelatedItem_sourceItemId_relatedItemId_key" ON "ItemRelatedItem"("sourceItemId", "relatedItemId");

-- CreateIndex
CREATE INDEX "ItemRelatedItem_sourceItemId_sortOrder_idx" ON "ItemRelatedItem"("sourceItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "ItemRelatedItem_relatedItemId_idx" ON "ItemRelatedItem"("relatedItemId");

-- AddForeignKey
ALTER TABLE "ItemRelatedItem" ADD CONSTRAINT "ItemRelatedItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRelatedItem" ADD CONSTRAINT "ItemRelatedItem_relatedItemId_fkey" FOREIGN KEY ("relatedItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
