CREATE TYPE "GreenwichReminderCheckpoint" AS ENUM ('DAYS_30', 'DAYS_7', 'DAYS_3');

CREATE TYPE "GreenwichReminderResponse" AS ENUM ('CONFIRMED', 'CHANGES_PENDING', 'CANCELLED');

CREATE TABLE "GreenwichOrderReminder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "checkpoint" "GreenwichReminderCheckpoint" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "telegramChatId" TEXT NOT NULL,
    "response" "GreenwichReminderResponse",
    "respondedAt" TIMESTAMP(3),
    "respondedByTelegramId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreenwichOrderReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GreenwichOrderReminder_orderId_checkpoint_key"
ON "GreenwichOrderReminder"("orderId", "checkpoint");

CREATE INDEX "GreenwichOrderReminder_scheduledFor_sentAt_idx"
ON "GreenwichOrderReminder"("scheduledFor", "sentAt");

CREATE INDEX "GreenwichOrderReminder_orderId_respondedAt_idx"
ON "GreenwichOrderReminder"("orderId", "respondedAt");

ALTER TABLE "GreenwichOrderReminder"
ADD CONSTRAINT "GreenwichOrderReminder_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
