-- CreateEnum
CREATE TYPE "ProjectMode" AS ENUM ('FULL', 'ESTIMATE_ONLY');

-- AlterEnum
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_CONVERTED';

-- AlterTable: estimate-only projects can exist before a customer is resolved.
ALTER TABLE "Project"
  ADD COLUMN "mode" "ProjectMode" NOT NULL DEFAULT 'FULL',
  ADD COLUMN "leadCustomerName" TEXT,
  ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable: customer identity in the unified queue.
ALTER TABLE "Customer"
  ADD COLUMN "logoKey" TEXT,
  ADD COLUMN "logoMimeType" TEXT,
  ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Project_mode_idx" ON "Project"("mode");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_logoKey_key" ON "Customer"("logoKey");
