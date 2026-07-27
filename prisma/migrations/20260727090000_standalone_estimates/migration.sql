-- Independent estimate workspaces no longer masquerade as projects.
CREATE TABLE "StandaloneEstimate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerId" TEXT,
    "leadCustomerName" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "convertedAt" TIMESTAMP(3),
    "convertedProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandaloneEstimate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StandaloneEstimate_convertedProjectId_key"
    ON "StandaloneEstimate"("convertedProjectId");
CREATE INDEX "StandaloneEstimate_customerId_idx"
    ON "StandaloneEstimate"("customerId");
CREATE INDEX "StandaloneEstimate_ownerUserId_idx"
    ON "StandaloneEstimate"("ownerUserId");
CREATE INDEX "StandaloneEstimate_convertedAt_idx"
    ON "StandaloneEstimate"("convertedAt");
CREATE INDEX "StandaloneEstimate_updatedAt_idx"
    ON "StandaloneEstimate"("updatedAt");

ALTER TABLE "StandaloneEstimate"
    ADD CONSTRAINT "StandaloneEstimate_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StandaloneEstimate"
    ADD CONSTRAINT "StandaloneEstimate_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StandaloneEstimate"
    ADD CONSTRAINT "StandaloneEstimate_convertedProjectId_fkey"
    FOREIGN KEY ("convertedProjectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateVersion"
    ALTER COLUMN "projectId" DROP NOT NULL,
    ADD COLUMN "standaloneEstimateId" TEXT;

CREATE INDEX "ProjectEstimateVersion_standaloneEstimateId_idx"
    ON "ProjectEstimateVersion"("standaloneEstimateId");
CREATE UNIQUE INDEX "ProjectEstimateVersion_standaloneEstimateId_versionNumber_key"
    ON "ProjectEstimateVersion"("standaloneEstimateId", "versionNumber");

ALTER TABLE "ProjectEstimateVersion"
    ADD CONSTRAINT "ProjectEstimateVersion_standaloneEstimateId_fkey"
    FOREIGN KEY ("standaloneEstimateId") REFERENCES "StandaloneEstimate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing quick calculations. The old Project row is archived instead
-- of being deleted so any legacy demo requisition/files remain recoverable.
INSERT INTO "StandaloneEstimate" (
    "id",
    "title",
    "customerId",
    "leadCustomerName",
    "ownerUserId",
    "createdAt",
    "updatedAt"
)
SELECT
    p."id",
    p."title",
    p."customerId",
    p."leadCustomerName",
    p."ownerUserId",
    p."createdAt",
    p."updatedAt"
FROM "Project" p
WHERE p."mode" = 'ESTIMATE_ONLY';

UPDATE "ProjectEstimateVersion" version
SET
    "standaloneEstimateId" = version."projectId",
    "projectId" = NULL,
    "includeInProjectTotals" = FALSE
WHERE version."projectId" IN (
    SELECT "id" FROM "Project" WHERE "mode" = 'ESTIMATE_ONLY'
);

INSERT INTO "ProjectEstimateVersion" (
    "id",
    "projectId",
    "standaloneEstimateId",
    "versionNumber",
    "title",
    "isPrimary",
    "sortOrder",
    "includeInProjectTotals",
    "commissionEnabled",
    "clientTaxEnabled",
    "clientChargeTaxEnabled",
    "createdById",
    "createdAt"
)
SELECT
    'standalone-estimate-version-' || estimate."id",
    NULL,
    estimate."id",
    1,
    'Смета',
    TRUE,
    0,
    FALSE,
    TRUE,
    TRUE,
    FALSE,
    estimate."ownerUserId",
    estimate."createdAt"
FROM "StandaloneEstimate" estimate
WHERE NOT EXISTS (
    SELECT 1
    FROM "ProjectEstimateVersion" version
    WHERE version."standaloneEstimateId" = estimate."id"
);

UPDATE "Project"
SET
    "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP),
    "archiveNote" = COALESCE(
        "archiveNote",
        'Перенесено в независимые сметы при обновлении модели расчётов.'
    )
WHERE "mode" = 'ESTIMATE_ONLY';

ALTER TABLE "ProjectEstimateVersion"
    ADD CONSTRAINT "ProjectEstimateVersion_exactly_one_owner_check"
    CHECK (
        ("projectId" IS NOT NULL AND "standaloneEstimateId" IS NULL)
        OR
        ("projectId" IS NULL AND "standaloneEstimateId" IS NOT NULL)
    );
