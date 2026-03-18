/*
  Warnings:

  - Added the required column `updatedAt` to the `Incident` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "repairedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "utilizedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LossRecord" ADD COLUMN     "foundQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "writtenOffQty" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Incident_status_condition_idx" ON "Incident"("status", "condition");
