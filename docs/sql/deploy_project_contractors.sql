-- Apply this file only to the intended workspace DB after backup.
-- Additive and rerunnable; does not update existing proposals, contacts, prices or reservations.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('wowstorg:project-contractors-roster'));
DO $roster$
BEGIN
  IF to_regclass('public."ProjectContractor"') IS NULL THEN
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
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ProjectContractor' AND column_name IN ('id','projectId','contractorId','scheduleSlotId','name','responsibility','contactName','phone','email','status','arrivalNote','internalNotes','revision','creationHash','createdById','updatedById','createdAt','updatedAt')) <> 18 THEN
    RAISE EXCEPTION 'ProjectContractor schema differs. Do not deploy until checked.';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public."ProjectContractor"'::regclass AND conname IN ('ProjectContractor_pkey','ProjectContractor_status_check','ProjectContractor_revision_check','ProjectContractor_projectId_fkey','ProjectContractor_contractorId_fkey','ProjectContractor_scheduleSlotId_fkey','ProjectContractor_createdById_fkey','ProjectContractor_updatedById_fkey')) <> 8
    OR (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='ProjectContractor' AND indexname IN ('ProjectContractor_projectId_contractorId_key','ProjectContractor_projectId_status_idx','ProjectContractor_contractorId_idx','ProjectContractor_scheduleSlotId_idx','ProjectContractor_createdById_idx','ProjectContractor_updatedById_idx')) <> 6 THEN
    RAISE EXCEPTION 'ProjectContractor constraints/indexes differ. Inspect schema before deploying.';
  END IF;
END $roster$;
ALTER TABLE "ProjectContractor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProjectContractor" FROM anon, authenticated;
COMMIT;
SELECT 'PROJECT_CONTRACTORS_SCHEMA_READY' AS result;
