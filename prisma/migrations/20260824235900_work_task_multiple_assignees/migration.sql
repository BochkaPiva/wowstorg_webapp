-- Multiple assignees for tasks and recursive checklist items.
-- Legacy assigneeUserId remains populated with the first assignee for compatibility
-- with older deployments and background jobs during the rollout.

CREATE TABLE IF NOT EXISTS "WorkTaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskAssignee_pkey" PRIMARY KEY ("taskId", "userId")
);

CREATE TABLE IF NOT EXISTS "WorkTaskChecklistAssignee" (
    "checklistItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskChecklistAssignee_pkey" PRIMARY KEY ("checklistItemId", "userId")
);

CREATE INDEX IF NOT EXISTS "WorkTaskAssignee_userId_taskId_idx"
    ON "WorkTaskAssignee"("userId", "taskId");

CREATE INDEX IF NOT EXISTS "WorkTaskChecklistAssignee_userId_checklistItemId_idx"
    ON "WorkTaskChecklistAssignee"("userId", "checklistItemId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WorkTaskAssignee_taskId_fkey'
    ) THEN
        ALTER TABLE "WorkTaskAssignee"
            ADD CONSTRAINT "WorkTaskAssignee_taskId_fkey"
            FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WorkTaskAssignee_userId_fkey'
    ) THEN
        ALTER TABLE "WorkTaskAssignee"
            ADD CONSTRAINT "WorkTaskAssignee_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WorkTaskChecklistAssignee_checklistItemId_fkey'
    ) THEN
        ALTER TABLE "WorkTaskChecklistAssignee"
            ADD CONSTRAINT "WorkTaskChecklistAssignee_checklistItemId_fkey"
            FOREIGN KEY ("checklistItemId") REFERENCES "WorkTaskChecklistItem"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WorkTaskChecklistAssignee_userId_fkey'
    ) THEN
        ALTER TABLE "WorkTaskChecklistAssignee"
            ADD CONSTRAINT "WorkTaskChecklistAssignee_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

INSERT INTO "WorkTaskAssignee" ("taskId", "userId")
SELECT "id", "assigneeUserId"
FROM "WorkTask"
WHERE "assigneeUserId" IS NOT NULL
ON CONFLICT ("taskId", "userId") DO NOTHING;

INSERT INTO "WorkTaskChecklistAssignee" ("checklistItemId", "userId")
SELECT "id", "assigneeUserId"
FROM "WorkTaskChecklistItem"
WHERE "assigneeUserId" IS NOT NULL
ON CONFLICT ("checklistItemId", "userId") DO NOTHING;

ALTER TABLE "WorkTaskAssignee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkTaskChecklistAssignee" ENABLE ROW LEVEL SECURITY;
