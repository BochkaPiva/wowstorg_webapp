-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryPrice" DECIMAL(12,2),
ADD COLUMN     "demontagePrice" DECIMAL(12,2),
ADD COLUMN     "montagePrice" DECIMAL(12,2);
