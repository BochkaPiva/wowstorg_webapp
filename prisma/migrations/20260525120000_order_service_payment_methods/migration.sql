DO $$
BEGIN
  CREATE TYPE "OrderServicePaymentMethod" AS ENUM ('NON_CASH', 'CASH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "deliveryInternalPaymentMethod" "OrderServicePaymentMethod" NOT NULL DEFAULT 'NON_CASH',
ADD COLUMN IF NOT EXISTS "montageInternalPaymentMethod" "OrderServicePaymentMethod" NOT NULL DEFAULT 'NON_CASH',
ADD COLUMN IF NOT EXISTS "demontageInternalPaymentMethod" "OrderServicePaymentMethod" NOT NULL DEFAULT 'NON_CASH';
