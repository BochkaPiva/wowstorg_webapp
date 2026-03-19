-- Idempotency storage for Telegram daily reminders.
-- Prevents sending the same reminder twice for the same order/date/receiver.

CREATE TABLE "ReminderSent" (
  "id" BIGSERIAL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "ymd" TEXT NOT NULL,
  "receiverKey" TEXT NOT NULL,
  "receiverChatId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "ReminderSent_unique" ON "ReminderSent" ("type", "orderId", "ymd", "receiverKey");

