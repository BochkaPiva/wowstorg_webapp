BEGIN;
CREATE TABLE "ProjectContractorEntry" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "creationHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectContractorEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectContractorEntry_status_check" CHECK ("status" IN ('NOT_CONTACTED','DISCUSSING','WAITING','AGREED')),
  CONSTRAINT "ProjectContractorEntry_body_check" CHECK (length(btrim("body")) BETWEEN 1 AND 5000)
);
CREATE INDEX "ProjectContractorEntry_assignmentId_createdAt_id_idx" ON "ProjectContractorEntry"("assignmentId", "createdAt", "id");
CREATE INDEX "ProjectContractorEntry_authorId_idx" ON "ProjectContractorEntry"("authorId");
ALTER TABLE "ProjectContractorEntry" ADD CONSTRAINT "ProjectContractorEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProjectContractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectContractorEntry" ADD CONSTRAINT "ProjectContractorEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectContractorEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProjectContractorEntry" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON TABLE "ProjectContractorEntry" FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE "ProjectContractorEntry" FROM authenticated'; END IF;
END $$;
COMMIT;
