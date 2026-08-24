-- CreateEnum
CREATE TYPE "WorkTaskActivityKind" AS ENUM (
  'CREATED',
  'UPDATED',
  'MOVED',
  'COMPLETED',
  'REOPENED',
  'ARCHIVED',
  'RESTORED',
  'COMMENT',
  'SUBTASK_CREATED',
  'SUBTASK_UPDATED',
  'SUBTASK_COMPLETED',
  'SUBTASK_REOPENED',
  'SUBTASK_DELETED'
);

-- Extend tasks and subtasks
ALTER TABLE "WorkTask" ADD COLUMN "reminderAt" TIMESTAMP(3);

ALTER TABLE "WorkTaskChecklistItem"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "priority" "WorkTaskPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "color" TEXT,
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "reminderAt" TIMESTAMP(3),
  ADD COLUMN "assigneeUserId" TEXT;

-- CreateTable
CREATE TABLE "WorkTaskActivity" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "kind" "WorkTaskActivityKind" NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkTaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkTask_reminderAt_idx" ON "WorkTask"("reminderAt");
CREATE INDEX "WorkTaskChecklistItem_assigneeUserId_dueDate_idx" ON "WorkTaskChecklistItem"("assigneeUserId", "dueDate");
CREATE INDEX "WorkTaskChecklistItem_reminderAt_idx" ON "WorkTaskChecklistItem"("reminderAt");
CREATE INDEX "WorkTaskActivity_taskId_createdAt_idx" ON "WorkTaskActivity"("taskId", "createdAt");
CREATE INDEX "WorkTaskActivity_actorUserId_createdAt_idx" ON "WorkTaskActivity"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkTaskChecklistItem" ADD CONSTRAINT "WorkTaskChecklistItem_assigneeUserId_fkey"
  FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkTaskActivity" ADD CONSTRAINT "WorkTaskActivity_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskActivity" ADD CONSTRAINT "WorkTaskActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
