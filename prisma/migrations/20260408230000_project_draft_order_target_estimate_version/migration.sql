-- Link project demo draft order to a target estimate version.

ALTER TABLE "ProjectDraftOrder"
ADD COLUMN "estimateVersionId" TEXT;

CREATE INDEX "ProjectDraftOrder_estimateVersionId_idx"
ON "ProjectDraftOrder"("estimateVersionId");

ALTER TABLE "ProjectDraftOrder"
ADD CONSTRAINT "ProjectDraftOrder_estimateVersionId_fkey"
FOREIGN KEY ("estimateVersionId") REFERENCES "ProjectEstimateVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
