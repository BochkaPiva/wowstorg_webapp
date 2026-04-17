-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM (
  'LEAD',
  'BRIEFING',
  'INTERNAL_PREP',
  'PROPOSAL_SENT',
  'PROPOSAL_REVISION',
  'CONTRACT_PREP',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'PREPRODUCTION',
  'AWAITING_CLIENT_INPUT',
  'AWAITING_VENDOR',
  'READY_TO_RUN',
  'LIVE',
  'WRAP_UP',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED'
);

-- CreateEnum
CREATE TYPE "ProjectBall" AS ENUM ('CLIENT', 'WOWSTORG', 'VENDOR', 'VENUE', 'NONE');

-- CreateTable
CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'LEAD',
  "ball" "ProjectBall" NOT NULL DEFAULT 'CLIENT',
  "archivedAt" TIMESTAMP(3),
  "eventDateNote" TEXT,
  "eventDateConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "openBlockers" TEXT,
  "internalSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_customerId_idx" ON "Project" ("customerId");

-- CreateIndex
CREATE INDEX "Project_ownerUserId_idx" ON "Project" ("ownerUserId");

-- CreateIndex
CREATE INDEX "Project_archivedAt_idx" ON "Project" ("archivedAt");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project" ("status");

-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project" ("updatedAt");

-- AddForeignKey
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Order_projectId_idx" ON "Order" ("projectId");

-- AddForeignKey
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
