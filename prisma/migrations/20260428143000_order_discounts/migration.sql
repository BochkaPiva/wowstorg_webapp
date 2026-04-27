-- Manual rental discounts for orders. Discounts apply only to requisites/rental lines,
-- never to delivery/montage/demontage service prices.
CREATE TYPE "OrderDiscountType" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

ALTER TABLE "Order"
ADD COLUMN "rentalDiscountType" "OrderDiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "rentalDiscountPercent" DECIMAL(5, 2),
ADD COLUMN "rentalDiscountAmount" DECIMAL(12, 2),
ADD COLUMN "greenwichRequestedDiscountType" "OrderDiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "greenwichRequestedDiscountPercent" DECIMAL(5, 2),
ADD COLUMN "greenwichRequestedDiscountAmount" DECIMAL(12, 2),
ADD COLUMN "greenwichDiscountRequestComment" TEXT;
