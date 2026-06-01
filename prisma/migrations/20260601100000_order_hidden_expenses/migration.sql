CREATE TABLE "OrderHiddenExpense" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "comment" TEXT,
    "cost" DECIMAL(12,2) NOT NULL,
    "internalPaymentMethod" "OrderServicePaymentMethod" NOT NULL DEFAULT 'NON_CASH',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderHiddenExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderHiddenExpense_orderId_sortOrder_idx" ON "OrderHiddenExpense"("orderId", "sortOrder");
CREATE INDEX "OrderHiddenExpense_createdById_idx" ON "OrderHiddenExpense"("createdById");

ALTER TABLE "OrderHiddenExpense" ADD CONSTRAINT "OrderHiddenExpense_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderHiddenExpense" ADD CONSTRAINT "OrderHiddenExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
