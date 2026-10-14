BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- CreateTable
CREATE TABLE "TelegramDirectorSettings" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "directorUserId" TEXT,
    "telegramChatId" TEXT,
    "boardId" TEXT,
    "columnId" TEXT,
    "pendingAfterMessageId" INTEGER,
    "pendingExpiresAt" TIMESTAMP(3),
    "lastMessageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramDirectorSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramDirectorInbox" (
    "id" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "directorUserId" TEXT NOT NULL,
    "directorName" TEXT NOT NULL,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramDirectorInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramDirectorSettings_directorUserId_idx" ON "TelegramDirectorSettings"("directorUserId");

-- CreateIndex
CREATE INDEX "TelegramDirectorSettings_boardId_idx" ON "TelegramDirectorSettings"("boardId");

-- CreateIndex
CREATE INDEX "TelegramDirectorSettings_columnId_idx" ON "TelegramDirectorSettings"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramDirectorInbox_taskId_key" ON "TelegramDirectorInbox"("taskId");

-- CreateIndex
CREATE INDEX "TelegramDirectorInbox_directorUserId_createdAt_idx" ON "TelegramDirectorInbox"("directorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramDirectorInbox_telegramChatId_messageId_key" ON "TelegramDirectorInbox"("telegramChatId", "messageId");

-- AddForeignKey
ALTER TABLE "TelegramDirectorSettings" ADD CONSTRAINT "TelegramDirectorSettings_directorUserId_fkey" FOREIGN KEY ("directorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDirectorSettings" ADD CONSTRAINT "TelegramDirectorSettings_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "WorkTaskBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDirectorSettings" ADD CONSTRAINT "TelegramDirectorSettings_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "WorkTaskColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDirectorInbox" ADD CONSTRAINT "TelegramDirectorInbox_directorUserId_fkey" FOREIGN KEY ("directorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDirectorInbox" ADD CONSTRAINT "TelegramDirectorInbox_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing application cookie auth remains the only business-data access path.
ALTER TABLE "TelegramDirectorSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramDirectorInbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TelegramDirectorSettings", "TelegramDirectorInbox" FROM PUBLIC;
DO $roles$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON public."TelegramDirectorSettings", public."TelegramDirectorInbox" FROM %I', api_role);
    END IF;
  END LOOP;
END
$roles$;
INSERT INTO "TelegramDirectorSettings" ("id", "updatedAt") VALUES ('primary', CURRENT_TIMESTAMP);

COMMIT;
