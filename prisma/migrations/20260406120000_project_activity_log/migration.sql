-- CreateEnum
CREATE TYPE "ProjectActivityKind" AS ENUM (
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'ORDER_LINKED'
);

-- CreateTable
CREATE TABLE "ProjectActivityLog" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "kind" "ProjectActivityKind" NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectActivityLog_projectId_createdAt_idx" ON "ProjectActivityLog" ("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectActivityLog_actorUserId_idx" ON "ProjectActivityLog" ("actorUserId");

-- AddForeignKey
ALTER TABLE "ProjectActivityLog"
  ADD CONSTRAINT "ProjectActivityLog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityLog"
  ADD CONSTRAINT "ProjectActivityLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
