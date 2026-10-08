-- Студия КП V2: выполнить ВЕСЬ скрипт один раз в Supabase SQL Editor.
-- Перед запуском убедитесь, что открыт нужный production-проект, и сохраните backup.
-- Обе миграции атомарны: при ошибке ни одна правка схемы не сохранится.
-- Скрипт не удаляет и не перезаписывает проекты, КП, услуги или строки смет.
-- Повторно после успешного COMMIT не запускать. Историю Prisma он не меняет.

BEGIN;
SET LOCAL search_path TO public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- BEGIN MIGRATION: 20261007120000_standalone_proposals_v2
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
-- END MIGRATION: 20261007120000_standalone_proposals_v2

-- BEGIN MIGRATION: 20261008120000_proposal_command_receipts
CREATE TABLE "ProposalMutationReceipt" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "mutationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "delta" JSONB NOT NULL,
  "resultRevision" INTEGER NOT NULL,
  "reversedByMutationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProposalMutationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProposalMutationReceipt_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ProjectProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProposalMutationReceipt_proposalId_actorUserId_mutationId_key" ON "ProposalMutationReceipt"("proposalId", "actorUserId", "mutationId");
CREATE INDEX "ProposalMutationReceipt_proposalId_createdAt_idx" ON "ProposalMutationReceipt"("proposalId", "createdAt");

-- The application's DB-backed sessions and Prisma server are the only access path.
ALTER TABLE "ProposalMutationReceipt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProposalMutationReceipt" FROM anon, authenticated;
-- END MIGRATION: 20261008120000_proposal_command_receipts

COMMIT;

-- При успешном выполнении в результате будет STUDIO_V2_SCHEMA_READY.
SELECT 'STUDIO_V2_SCHEMA_READY' AS status;
