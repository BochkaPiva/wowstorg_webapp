-- CreateTable
CREATE TABLE "OrderNotificationCooldown" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "muteUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNotificationCooldown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderNotificationCooldown_orderId_blockKey_key" ON "OrderNotificationCooldown"("orderId", "blockKey");

-- CreateIndex
CREATE INDEX "OrderNotificationCooldown_orderId_idx" ON "OrderNotificationCooldown"("orderId");

-- CreateIndex
CREATE INDEX "OrderNotificationCooldown_orderId_muteUntil_idx" ON "OrderNotificationCooldown"("orderId", "muteUntil");

-- AddForeignKey
ALTER TABLE "OrderNotificationCooldown" ADD CONSTRAINT "OrderNotificationCooldown_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
