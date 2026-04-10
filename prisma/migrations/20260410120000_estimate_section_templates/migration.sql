-- AlterEnum
ALTER TYPE "ProjectEstimateSectionKind" ADD VALUE 'CONTRACTOR';

-- AlterTable
ALTER TABLE "ProjectEstimateSection" ADD COLUMN "lineLocalExtras" JSONB;

ALTER TABLE "ProjectEstimateLine" ADD COLUMN "unit" TEXT,
ADD COLUMN "qty" DECIMAL(14,4),
ADD COLUMN "unitPriceClient" DECIMAL(14,2),
ADD COLUMN "paymentMethod" VARCHAR(40),
ADD COLUMN "paymentStatus" VARCHAR(120),
ADD COLUMN "contractorNote" TEXT,
ADD COLUMN "contractorRequisites" VARCHAR(500);
