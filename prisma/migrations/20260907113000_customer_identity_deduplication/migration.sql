-- Add a conservative identity key. Existing duplicate groups keep one claimed key;
-- the admin merge flow resolves the remaining records without losing history.
ALTER TABLE "Customer"
ADD COLUMN "normalizedName" TEXT,
ADD COLUMN "mergedIntoId" TEXT;

WITH normalized AS (
  SELECT
    "id",
    NULLIF(
      regexp_replace(lower(replace(btrim("name"), 'ё', 'е')), '[^[:alnum:]]+', '', 'g'),
      ''
    ) AS "identityKey",
    row_number() OVER (
      PARTITION BY NULLIF(
        regexp_replace(lower(replace(btrim("name"), 'ё', 'е')), '[^[:alnum:]]+', '', 'g'),
        ''
      )
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "identityRank"
  FROM "Customer"
)
UPDATE "Customer" AS customer
SET "normalizedName" = normalized."identityKey"
FROM normalized
WHERE customer."id" = normalized."id"
  AND normalized."identityRank" = 1;

CREATE UNIQUE INDEX "Customer_normalizedName_key" ON "Customer"("normalizedName");
CREATE INDEX "Customer_mergedIntoId_idx" ON "Customer"("mergedIntoId");

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_mergedIntoId_fkey"
FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CustomerAlias" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAlias_customerId_name_key" ON "CustomerAlias"("customerId", "name");
CREATE INDEX "CustomerAlias_customerId_idx" ON "CustomerAlias"("customerId");
CREATE INDEX "CustomerAlias_normalizedName_idx" ON "CustomerAlias"("normalizedName");

ALTER TABLE "CustomerAlias"
ADD CONSTRAINT "CustomerAlias_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerMerge" (
  "id" TEXT NOT NULL,
  "sourceCustomerId" TEXT NOT NULL,
  "targetCustomerId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "targetName" TEXT NOT NULL,
  "movedOrders" INTEGER NOT NULL,
  "movedProjects" INTEGER NOT NULL,
  "movedStandaloneEstimates" INTEGER NOT NULL,
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerMerge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerMerge_sourceCustomerId_createdAt_idx" ON "CustomerMerge"("sourceCustomerId", "createdAt");
CREATE INDEX "CustomerMerge_targetCustomerId_createdAt_idx" ON "CustomerMerge"("targetCustomerId", "createdAt");
CREATE INDEX "CustomerMerge_actorUserId_createdAt_idx" ON "CustomerMerge"("actorUserId", "createdAt");

ALTER TABLE "CustomerMerge"
ADD CONSTRAINT "CustomerMerge_sourceCustomerId_fkey"
FOREIGN KEY ("sourceCustomerId") REFERENCES "Customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerMerge"
ADD CONSTRAINT "CustomerMerge_targetCustomerId_fkey"
FOREIGN KEY ("targetCustomerId") REFERENCES "Customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerMerge"
ADD CONSTRAINT "CustomerMerge_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
