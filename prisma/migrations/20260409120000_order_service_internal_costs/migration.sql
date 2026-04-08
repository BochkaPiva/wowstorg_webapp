-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryInternalCost" DECIMAL(12,2),
ADD COLUMN     "montageInternalCost" DECIMAL(12,2),
ADD COLUMN     "demontageInternalCost" DECIMAL(12,2);
