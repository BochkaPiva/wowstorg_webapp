-- Quick Supplement: link доп.-заявки to a parent Order.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "parentOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_parentOrderId_idx" ON "Order" ("parentOrderId");

