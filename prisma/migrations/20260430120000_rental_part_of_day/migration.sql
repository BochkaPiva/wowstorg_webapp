-- CreateEnum
CREATE TYPE "RentalPartOfDay" AS ENUM ('MORNING', 'EVENING');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "rentalStartPartOfDay" "RentalPartOfDay" NOT NULL DEFAULT 'MORNING';
ALTER TABLE "Order" ADD COLUMN "rentalEndPartOfDay" "RentalPartOfDay" NOT NULL DEFAULT 'EVENING';
