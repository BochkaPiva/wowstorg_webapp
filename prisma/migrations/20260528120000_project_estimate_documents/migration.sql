ALTER TABLE "ProjectEstimateVersion"
ADD COLUMN "title" TEXT,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "includeInProjectTotals" BOOLEAN NOT NULL DEFAULT true;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "versionNumber" ASC) - 1 AS rn,
    COUNT(*) OVER (PARTITION BY "projectId") AS cnt
  FROM "ProjectEstimateVersion"
)
UPDATE "ProjectEstimateVersion" v
SET
  "sortOrder" = ranked.rn,
  "title" = CASE
    WHEN COALESCE(NULLIF(BTRIM(v."note"), ''), '') <> '' THEN BTRIM(v."note")
    WHEN ranked.cnt = 1 THEN 'Смета проекта'
    ELSE 'Смета проекта ' || v."versionNumber"::text
  END
FROM ranked
WHERE ranked."id" = v."id";

CREATE INDEX "ProjectEstimateVersion_projectId_sortOrder_idx"
ON "ProjectEstimateVersion"("projectId", "sortOrder");

CREATE INDEX "ProjectEstimateVersion_projectId_includeInProjectTotals_idx"
ON "ProjectEstimateVersion"("projectId", "includeInProjectTotals");
