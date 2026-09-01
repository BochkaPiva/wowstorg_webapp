-- Project workspace V2 foundation: immutable creator, participants and modular layout.

CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'EDITOR');

ALTER TABLE "Project"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProjectEstimateVersion"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

UPDATE "Project"
SET "createdByUserId" = "ownerUserId"
WHERE "createdByUserId" IS NULL;

ALTER TABLE "Project"
  ALTER COLUMN "createdByUserId" SET NOT NULL;

CREATE TABLE "ProjectMember" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ProjectMemberRole" NOT NULL DEFAULT 'EDITOR',
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId", "userId")
);

CREATE TABLE "ProjectWidget" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "instanceKey" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "x" INTEGER NOT NULL DEFAULT 0,
  "y" INTEGER NOT NULL DEFAULT 0,
  "width" INTEGER NOT NULL DEFAULT 12,
  "heightPreset" TEXT NOT NULL DEFAULT 'AUTO',
  "config" JSONB,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectWidget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectWorkspaceItem" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "widgetId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "zIndex" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB,
  "linkedTaskId" TEXT,
  "linkedOrderId" TEXT,
  "linkedFileId" TEXT,
  "linkedSectionId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectWorkspaceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMutationReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "mutationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMutationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectWorkspaceTemplate" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "widgets" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectWorkspaceTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "ProjectEstimateCustomColumnType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'FORMULA');

CREATE TABLE "ProjectEstimateCustomColumn" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "type" "ProjectEstimateCustomColumnType" NOT NULL,
  "formula" VARCHAR(500),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "width" INTEGER NOT NULL DEFAULT 160,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectEstimateCustomColumn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectEstimateCustomCell" (
  "lineId" TEXT NOT NULL,
  "columnId" TEXT NOT NULL,
  "value" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectEstimateCustomCell_pkey" PRIMARY KEY ("lineId", "columnId")
);

-- Keep layout and helper-column invariants valid even for future maintenance
-- scripts that bypass the HTTP/Zod layer.
ALTER TABLE "ProjectWidget"
  ADD CONSTRAINT "ProjectWidget_sortOrder_check" CHECK ("sortOrder" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ProjectWidget_x_check" CHECK ("x" BETWEEN 0 AND 11),
  ADD CONSTRAINT "ProjectWidget_y_check" CHECK ("y" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ProjectWidget_width_check" CHECK ("width" IN (4, 6, 8, 12)),
  ADD CONSTRAINT "ProjectWidget_heightPreset_check" CHECK ("heightPreset" IN ('COMPACT', 'MEDIUM', 'LARGE', 'AUTO')),
  ADD CONSTRAINT "ProjectWidget_revision_check" CHECK ("revision" >= 0);

ALTER TABLE "ProjectWorkspaceItem"
  ADD CONSTRAINT "ProjectWorkspaceItem_x_check" CHECK ("x" BETWEEN 0 AND 23),
  ADD CONSTRAINT "ProjectWorkspaceItem_y_check" CHECK ("y" BETWEEN 0 AND 999),
  ADD CONSTRAINT "ProjectWorkspaceItem_width_check" CHECK ("width" BETWEEN 2 AND 24),
  ADD CONSTRAINT "ProjectWorkspaceItem_height_check" CHECK ("height" BETWEEN 2 AND 20),
  ADD CONSTRAINT "ProjectWorkspaceItem_bounds_check" CHECK ("x" + "width" <= 24),
  ADD CONSTRAINT "ProjectWorkspaceItem_zIndex_check" CHECK ("zIndex" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "ProjectWorkspaceItem_revision_check" CHECK ("revision" >= 0);

ALTER TABLE "ProjectEstimateCustomColumn"
  ADD CONSTRAINT "ProjectEstimateCustomColumn_sortOrder_check" CHECK ("sortOrder" BETWEEN 0 AND 11),
  ADD CONSTRAINT "ProjectEstimateCustomColumn_width_check" CHECK ("width" BETWEEN 120 AND 360),
  ADD CONSTRAINT "ProjectEstimateCustomColumn_formula_check" CHECK (
    ("type" = 'FORMULA' AND "formula" IS NOT NULL AND length(btrim("formula")) > 0)
    OR ("type" <> 'FORMULA' AND "formula" IS NULL)
  );

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_revision_check" CHECK ("revision" >= 0);

ALTER TABLE "ProjectEstimateVersion"
  ADD CONSTRAINT "ProjectEstimateVersion_revision_check" CHECK ("revision" >= 0);

CREATE INDEX "Project_createdByUserId_idx" ON "Project"("createdByUserId");
CREATE INDEX "ProjectMember_userId_projectId_idx" ON "ProjectMember"("userId", "projectId");
CREATE INDEX "ProjectMember_addedById_idx" ON "ProjectMember"("addedById");
CREATE UNIQUE INDEX "ProjectWidget_projectId_instanceKey_key" ON "ProjectWidget"("projectId", "instanceKey");
CREATE INDEX "ProjectWidget_projectId_sortOrder_idx" ON "ProjectWidget"("projectId", "sortOrder");
CREATE INDEX "ProjectWidget_type_idx" ON "ProjectWidget"("type");
CREATE INDEX "ProjectWidget_createdById_idx" ON "ProjectWidget"("createdById");
CREATE INDEX "ProjectWidget_updatedById_idx" ON "ProjectWidget"("updatedById");
CREATE INDEX "ProjectWorkspaceItem_projectId_widgetId_deletedAt_idx" ON "ProjectWorkspaceItem"("projectId", "widgetId", "deletedAt");
CREATE INDEX "ProjectWorkspaceItem_widgetId_idx" ON "ProjectWorkspaceItem"("widgetId");
CREATE INDEX "ProjectWorkspaceItem_createdById_idx" ON "ProjectWorkspaceItem"("createdById");
CREATE INDEX "ProjectWorkspaceItem_updatedById_idx" ON "ProjectWorkspaceItem"("updatedById");
CREATE INDEX "ProjectWorkspaceItem_linkedTaskId_idx" ON "ProjectWorkspaceItem"("linkedTaskId");
CREATE INDEX "ProjectWorkspaceItem_linkedOrderId_idx" ON "ProjectWorkspaceItem"("linkedOrderId");
CREATE INDEX "ProjectWorkspaceItem_linkedFileId_idx" ON "ProjectWorkspaceItem"("linkedFileId");
CREATE INDEX "ProjectWorkspaceItem_linkedSectionId_idx" ON "ProjectWorkspaceItem"("linkedSectionId");
CREATE UNIQUE INDEX "ProjectMutationReceipt_projectId_actorUserId_mutationId_key" ON "ProjectMutationReceipt"("projectId", "actorUserId", "mutationId");
CREATE INDEX "ProjectMutationReceipt_createdAt_idx" ON "ProjectMutationReceipt"("createdAt");
CREATE INDEX "ProjectMutationReceipt_actorUserId_idx" ON "ProjectMutationReceipt"("actorUserId");
CREATE UNIQUE INDEX "ProjectWorkspaceTemplate_ownerUserId_name_key" ON "ProjectWorkspaceTemplate"("ownerUserId", "name");
CREATE INDEX "ProjectWorkspaceTemplate_ownerUserId_updatedAt_idx" ON "ProjectWorkspaceTemplate"("ownerUserId", "updatedAt");
CREATE UNIQUE INDEX "ProjectEstimateCustomColumn_versionId_key_key" ON "ProjectEstimateCustomColumn"("versionId", "key");
CREATE INDEX "ProjectEstimateCustomColumn_versionId_sortOrder_idx" ON "ProjectEstimateCustomColumn"("versionId", "sortOrder");
CREATE INDEX "ProjectEstimateCustomCell_columnId_idx" ON "ProjectEstimateCustomCell"("columnId");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMember_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectWidget"
  ADD CONSTRAINT "ProjectWidget_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWidget_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWidget_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectWorkspaceItem"
  ADD CONSTRAINT "ProjectWorkspaceItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWorkspaceItem_widgetId_fkey"
  FOREIGN KEY ("widgetId") REFERENCES "ProjectWidget"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWorkspaceItem_linkedTaskId_fkey"
  FOREIGN KEY ("linkedTaskId") REFERENCES "WorkTask"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWorkspaceItem_linkedOrderId_fkey"
  FOREIGN KEY ("linkedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWorkspaceItem_linkedFileId_fkey"
  FOREIGN KEY ("linkedFileId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWorkspaceItem_linkedSectionId_fkey"
  FOREIGN KEY ("linkedSectionId") REFERENCES "ProjectEstimateSection"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWorkspaceItem_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectWorkspaceItem_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMutationReceipt"
  ADD CONSTRAINT "ProjectMutationReceipt_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMutationReceipt_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectWorkspaceTemplate"
  ADD CONSTRAINT "ProjectWorkspaceTemplate_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateCustomColumn"
  ADD CONSTRAINT "ProjectEstimateCustomColumn_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "ProjectEstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEstimateCustomCell"
  ADD CONSTRAINT "ProjectEstimateCustomCell_lineId_fkey"
  FOREIGN KEY ("lineId") REFERENCES "ProjectEstimateLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectEstimateCustomCell_columnId_fkey"
  FOREIGN KEY ("columnId") REFERENCES "ProjectEstimateCustomColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProjectMember" ("projectId", "userId", "role", "addedById")
SELECT "id", "ownerUserId", 'OWNER', "createdByUserId"
FROM "Project"
ON CONFLICT ("projectId", "userId") DO NOTHING;

INSERT INTO "ProjectWidget" (
  "id", "projectId", "instanceKey", "type", "sortOrder", "x", "y", "width", "heightPreset",
  "createdById", "updatedById", "updatedAt"
)
SELECT
  'pw_' || md5("id" || ':estimate'), "id", 'estimate', 'ESTIMATE', 0, 0, 0, 12, 'LARGE',
  "createdByUserId", "createdByUserId", CURRENT_TIMESTAMP
FROM "Project"
WHERE "mode" = 'FULL'
ON CONFLICT ("projectId", "instanceKey") DO NOTHING;

INSERT INTO "ProjectWidget" (
  "id", "projectId", "instanceKey", "type", "sortOrder", "x", "y", "width", "heightPreset",
  "createdById", "updatedById", "updatedAt"
)
SELECT
  'pw_' || md5("id" || ':orders'), "id", 'orders', 'ORDERS', 1, 0, 1, 12, 'MEDIUM',
  "createdByUserId", "createdByUserId", CURRENT_TIMESTAMP
FROM "Project"
WHERE "mode" = 'FULL'
ON CONFLICT ("projectId", "instanceKey") DO NOTHING;

ALTER TABLE "ProjectMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectWidget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectWorkspaceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMutationReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectWorkspaceTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectEstimateCustomColumn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectEstimateCustomCell" ENABLE ROW LEVEL SECURITY;

-- These workspace tables are accessed only through authenticated server routes.
-- Keep Supabase Data API roles out even if project-wide defaults change later.
REVOKE ALL ON TABLE "ProjectMember" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProjectWidget" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProjectWorkspaceItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProjectMutationReceipt" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProjectWorkspaceTemplate" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProjectEstimateCustomColumn" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProjectEstimateCustomCell" FROM anon, authenticated;
