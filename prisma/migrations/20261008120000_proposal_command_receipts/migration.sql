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
