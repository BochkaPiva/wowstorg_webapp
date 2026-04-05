-- CreateEnum
CREATE TYPE "ProjectEstimateSectionKind" AS ENUM ('LOCAL', 'REQUISITE');

-- AlterEnum
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_ESTIMATE_VERSION_CREATED';

-- CreateTable
CREATE TABLE "ProjectEstimateVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEstimateSection" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "kind" "ProjectEstimateSectionKind" NOT NULL,
    "linkedOrderId" TEXT,

    CONSTRAINT "ProjectEstimateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEstimateLine" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "lineNumber" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lineType" TEXT NOT NULL DEFAULT 'OTHER',
    "costClient" DECIMAL(14,2),
    "costInternal" DECIMAL(14,2),
    "orderLineId" TEXT,
    "itemId" TEXT,

    CONSTRAINT "ProjectEstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectScheduleDay" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dateNote" TEXT NOT NULL,

    CONSTRAINT "ProjectScheduleDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectScheduleSlot" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "intervalText" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "ProjectScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEstimateVersion_projectId_versionNumber_key" ON "ProjectEstimateVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "ProjectEstimateVersion_projectId_idx" ON "ProjectEstimateVersion"("projectId");

-- CreateIndex
CREATE INDEX "ProjectEstimateSection_versionId_idx" ON "ProjectEstimateSection"("versionId");

-- CreateIndex
CREATE INDEX "ProjectEstimateSection_linkedOrderId_idx" ON "ProjectEstimateSection"("linkedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEstimateLine_orderLineId_key" ON "ProjectEstimateLine"("orderLineId");

-- CreateIndex
CREATE INDEX "ProjectEstimateLine_sectionId_position_idx" ON "ProjectEstimateLine"("sectionId", "position");

-- CreateIndex
CREATE INDEX "ProjectScheduleDay_projectId_idx" ON "ProjectScheduleDay"("projectId");

-- CreateIndex
CREATE INDEX "ProjectScheduleSlot_dayId_sortOrder_idx" ON "ProjectScheduleSlot"("dayId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProjectEstimateVersion" ADD CONSTRAINT "ProjectEstimateVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateVersion" ADD CONSTRAINT "ProjectEstimateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateSection" ADD CONSTRAINT "ProjectEstimateSection_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectEstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateSection" ADD CONSTRAINT "ProjectEstimateSection_linkedOrderId_fkey" FOREIGN KEY ("linkedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateLine" ADD CONSTRAINT "ProjectEstimateLine_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProjectEstimateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateLine" ADD CONSTRAINT "ProjectEstimateLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateLine" ADD CONSTRAINT "ProjectEstimateLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectScheduleDay" ADD CONSTRAINT "ProjectScheduleDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectScheduleSlot" ADD CONSTRAINT "ProjectScheduleSlot_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ProjectScheduleDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
