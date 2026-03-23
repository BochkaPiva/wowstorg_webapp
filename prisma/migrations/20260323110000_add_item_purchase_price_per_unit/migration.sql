-- Add optional purchase price per item unit for profitability analytics.
ALTER TABLE "Item"
ADD COLUMN "purchasePricePerUnit" DECIMAL(12,2);

