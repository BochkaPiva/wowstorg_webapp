ALTER TABLE "ProjectEstimateVersion"
ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "versionNumber" DESC
    ) AS rn
  FROM "ProjectEstimateVersion"
)
UPDATE "ProjectEstimateVersion" v
SET "isPrimary" = true
FROM ranked r
WHERE v."id" = r."id"
  AND r.rn = 1;
