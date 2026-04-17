ALTER TABLE "ProjectContact"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "isActive" DESC, "createdAt" ASC, id ASC
    ) - 1 AS rn
  FROM "ProjectContact"
)
UPDATE "ProjectContact" pc
SET "sortOrder" = ordered.rn
FROM ordered
WHERE pc.id = ordered.id;

CREATE INDEX "ProjectContact_projectId_sortOrder_idx"
ON "ProjectContact"("projectId", "sortOrder");
