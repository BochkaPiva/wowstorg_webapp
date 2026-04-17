-- Восстановление после ошибочного DROP в локальном migrate dev (таблица должна совпадать с 20260319160000_reminders_sent).
CREATE TABLE IF NOT EXISTS "ReminderSent" (
  "id" BIGSERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "ymd" TEXT NOT NULL,
  "receiverKey" TEXT NOT NULL,
  "receiverChatId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReminderSent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReminderSent_unique" ON "ReminderSent" ("type", "orderId", "ymd", "receiverKey");
