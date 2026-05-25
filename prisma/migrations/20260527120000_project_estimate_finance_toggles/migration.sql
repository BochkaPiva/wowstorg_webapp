ALTER TABLE "ProjectEstimateVersion"
ADD COLUMN "commissionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "clientTaxEnabled" BOOLEAN NOT NULL DEFAULT true;
