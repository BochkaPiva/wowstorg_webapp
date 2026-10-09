CREATE TABLE "ProjectContractor" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "contractorId" TEXT, "scheduleSlotId" TEXT,
  "name" TEXT NOT NULL, "responsibility" TEXT NOT NULL,
  "contactName" TEXT, "phone" TEXT, "email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "arrivalNote" TEXT, "internalNotes" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0, "creationHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectContractor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectContractor_status_check" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'DONE', 'CANCELLED')),
  CONSTRAINT "ProjectContractor_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "ProjectContractor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectContractor_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProjectContractor_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "ProjectScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProjectContractor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectContractor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectContractor_projectId_contractorId_key" ON "ProjectContractor"("projectId", "contractorId");
CREATE INDEX "ProjectContractor_projectId_status_idx" ON "ProjectContractor"("projectId", "status");
CREATE INDEX "ProjectContractor_contractorId_idx" ON "ProjectContractor"("contractorId");
CREATE INDEX "ProjectContractor_scheduleSlotId_idx" ON "ProjectContractor"("scheduleSlotId");
CREATE INDEX "ProjectContractor_createdById_idx" ON "ProjectContractor"("createdById");
CREATE INDEX "ProjectContractor_updatedById_idx" ON "ProjectContractor"("updatedById");
-- This app uses server-side Prisma and DB-backed cookies, not browser Supabase Auth.
ALTER TABLE "ProjectContractor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProjectContractor" FROM anon, authenticated;
