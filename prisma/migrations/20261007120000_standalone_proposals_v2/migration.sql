-- Temporary commercial proposals can exist before a project and later move into one
-- without copying their variants, items, snapshots, or estimate links.

CREATE TABLE "StandaloneProposal" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "customerId" TEXT,
  "leadCustomerName" TEXT,
  "ownerUserId" TEXT NOT NULL,
  "convertedAt" TIMESTAMP(3),
  "convertedProjectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandaloneProposal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProjectProposal"
  ALTER COLUMN "projectId" DROP NOT NULL,
  ADD COLUMN "standaloneProposalId" TEXT;

ALTER TABLE "CustomerMerge"
  ADD COLUMN "movedStandaloneProposals" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "StandaloneProposal_convertedProjectId_idx"
  ON "StandaloneProposal"("convertedProjectId");
CREATE INDEX "StandaloneProposal_customerId_idx"
  ON "StandaloneProposal"("customerId");
CREATE INDEX "StandaloneProposal_ownerUserId_idx"
  ON "StandaloneProposal"("ownerUserId");
CREATE INDEX "StandaloneProposal_convertedAt_idx"
  ON "StandaloneProposal"("convertedAt");
CREATE INDEX "StandaloneProposal_updatedAt_idx"
  ON "StandaloneProposal"("updatedAt");

CREATE UNIQUE INDEX "ProjectProposal_standaloneProposalId_key"
  ON "ProjectProposal"("standaloneProposalId");
CREATE INDEX "ProjectProposal_standaloneProposalId_updatedAt_idx"
  ON "ProjectProposal"("standaloneProposalId", "updatedAt");

ALTER TABLE "StandaloneProposal"
  ADD CONSTRAINT "StandaloneProposal_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StandaloneProposal"
  ADD CONSTRAINT "StandaloneProposal_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StandaloneProposal"
  ADD CONSTRAINT "StandaloneProposal_convertedProjectId_fkey"
  FOREIGN KEY ("convertedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProposal"
  ADD CONSTRAINT "ProjectProposal_standaloneProposalId_fkey"
  FOREIGN KEY ("standaloneProposalId") REFERENCES "StandaloneProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectProposal"
  ADD CONSTRAINT "ProjectProposal_exactly_one_owner"
  CHECK (("projectId" IS NOT NULL)::INTEGER + ("standaloneProposalId" IS NOT NULL)::INTEGER = 1);

-- This application reaches business tables through the server-side Prisma connection.
-- Keep the new public-schema table unavailable to Supabase Data API roles.
ALTER TABLE "StandaloneProposal" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "StandaloneProposal" FROM anon, authenticated;
