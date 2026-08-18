ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "clientPaymentMethod" "OrderServicePaymentMethod" NOT NULL DEFAULT 'NON_CASH';
