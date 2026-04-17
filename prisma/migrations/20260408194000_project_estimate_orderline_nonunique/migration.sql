DROP INDEX IF EXISTS "ProjectEstimateLine_orderLineId_key";

CREATE INDEX IF NOT EXISTS "ProjectEstimateLine_orderLineId_idx"
ON "ProjectEstimateLine"("orderLineId");
