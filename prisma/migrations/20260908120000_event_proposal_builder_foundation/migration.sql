CREATE TYPE "ContractorOfferPriceType" AS ENUM ('FIXED', 'FROM', 'RANGE', 'PER_PERSON', 'PER_HOUR', 'PER_DAY', 'PER_UNIT', 'ON_REQUEST');
CREATE TYPE "ProjectProposalStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'APPROVED', 'ARCHIVED');
CREATE TYPE "ProjectProposalItemKind" AS ENUM ('CATALOG', 'MANUAL');
CREATE TYPE "ProjectProposalSelectionRole" AS ENUM ('PRIMARY', 'ALTERNATIVE', 'OPTIONAL', 'EXCLUDED');
CREATE TYPE "ProjectProposalSnapshotReason" AS ENUM ('MANUAL', 'EXPORT', 'SENT');

ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_PROPOSAL_CREATED';
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_PROPOSAL_UPDATED';
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_PROPOSAL_TRANSFERRED';

CREATE TABLE "ContractorCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractorCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contractor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "shortDescription" TEXT,
  "websiteUrl" TEXT,
  "city" TEXT,
  "internalNotes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractorContact" (
  "id" TEXT NOT NULL,
  "contractorId" TEXT NOT NULL,
  "personName" TEXT,
  "role" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "telegram" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractorContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractorAsset" (
  "id" TEXT NOT NULL,
  "contractorId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'PHOTO',
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "caption" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "focalX" DECIMAL(5,4),
  "focalY" DECIMAL(5,4),
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractorAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractorOffer" (
  "id" TEXT NOT NULL,
  "contractorId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priceType" "ContractorOfferPriceType" NOT NULL DEFAULT 'FIXED',
  "clientPrice" DECIMAL(14,2),
  "clientPriceMax" DECIMAL(14,2),
  "internalCost" DECIMAL(14,2),
  "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "unitLabel" TEXT,
  "minimumQty" DECIMAL(14,4),
  "maximumQty" DECIMAL(14,4),
  "includesText" TEXT,
  "excludesText" TEXT,
  "sourceUrl" TEXT,
  "sourceNote" TEXT,
  "priceConfirmedAt" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "priceConfirmedById" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractorOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractorOfferPriceHistory" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "priceType" "ContractorOfferPriceType" NOT NULL,
  "clientPrice" DECIMAL(14,2),
  "clientPriceMax" DECIMAL(14,2),
  "internalCost" DECIMAL(14,2),
  "unitLabel" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractorOfferPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProposal" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ProjectProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "clientIntro" TEXT,
  "clientOutro" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProposalVariant" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isRecommended" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectProposalVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProposalSection" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "categoryId" TEXT,
  "categoryNameSnapshot" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectProposalSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProposalItem" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "contractorId" TEXT,
  "offerId" TEXT,
  "kind" "ProjectProposalItemKind" NOT NULL DEFAULT 'CATALOG',
  "selectionRole" "ProjectProposalSelectionRole" NOT NULL DEFAULT 'PRIMARY',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "qty" DECIMAL(14,4) NOT NULL DEFAULT 1,
  "clientUnitPrice" DECIMAL(14,2),
  "internalUnitCost" DECIMAL(14,2),
  "unitLabel" TEXT,
  "clientNote" TEXT,
  "internalNote" TEXT,
  "contractorNameSnapshot" TEXT NOT NULL,
  "offerTitleSnapshot" TEXT NOT NULL,
  "offerDescriptionSnapshot" TEXT,
  "priceTypeSnapshot" "ContractorOfferPriceType" NOT NULL,
  "currencyCodeSnapshot" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "sourcePriceConfirmedAt" TIMESTAMP(3),
  "sourceOfferRevision" INTEGER,
  "assetSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectProposalItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProposalSnapshot" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "reason" "ProjectProposalSnapshotReason" NOT NULL,
  "clientData" JSONB NOT NULL,
  "internalSummary" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectProposalSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProposalEstimateLink" (
  "id" TEXT NOT NULL,
  "proposalItemId" TEXT,
  "estimateVersionId" TEXT NOT NULL,
  "estimateLineId" TEXT,
  "sourceSnapshot" JSONB NOT NULL,
  "sourceProposalRevision" INTEGER NOT NULL,
  "transferredById" TEXT NOT NULL,
  "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectProposalEstimateLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractorCategory_normalizedName_key" ON "ContractorCategory"("normalizedName");
CREATE INDEX "ContractorCategory_isActive_sortOrder_idx" ON "ContractorCategory"("isActive", "sortOrder");
CREATE UNIQUE INDEX "Contractor_normalizedName_key" ON "Contractor"("normalizedName");
CREATE INDEX "Contractor_isActive_name_idx" ON "Contractor"("isActive", "name");
CREATE INDEX "Contractor_city_idx" ON "Contractor"("city");
CREATE INDEX "Contractor_createdById_idx" ON "Contractor"("createdById");
CREATE INDEX "Contractor_updatedById_idx" ON "Contractor"("updatedById");
CREATE INDEX "ContractorContact_contractorId_sortOrder_idx" ON "ContractorContact"("contractorId", "sortOrder");
CREATE UNIQUE INDEX "ContractorAsset_storageKey_key" ON "ContractorAsset"("storageKey");
CREATE INDEX "ContractorAsset_contractorId_kind_sortOrder_idx" ON "ContractorAsset"("contractorId", "kind", "sortOrder");
CREATE INDEX "ContractorAsset_uploadedById_idx" ON "ContractorAsset"("uploadedById");
CREATE INDEX "ContractorOffer_contractorId_isActive_idx" ON "ContractorOffer"("contractorId", "isActive");
CREATE INDEX "ContractorOffer_categoryId_isActive_idx" ON "ContractorOffer"("categoryId", "isActive");
CREATE INDEX "ContractorOffer_priceConfirmedAt_idx" ON "ContractorOffer"("priceConfirmedAt");
CREATE INDEX "ContractorOffer_priceConfirmedById_idx" ON "ContractorOffer"("priceConfirmedById");
CREATE INDEX "ContractorOfferPriceHistory_offerId_createdAt_idx" ON "ContractorOfferPriceHistory"("offerId", "createdAt");
CREATE INDEX "ContractorOfferPriceHistory_actorUserId_idx" ON "ContractorOfferPriceHistory"("actorUserId");
CREATE INDEX "ProjectProposal_projectId_isCurrent_updatedAt_idx" ON "ProjectProposal"("projectId", "isCurrent", "updatedAt");
CREATE UNIQUE INDEX "ProjectProposal_one_current_per_project" ON "ProjectProposal"("projectId") WHERE "isCurrent" = true;
CREATE INDEX "ProjectProposal_createdById_idx" ON "ProjectProposal"("createdById");
CREATE INDEX "ProjectProposal_updatedById_idx" ON "ProjectProposal"("updatedById");
CREATE INDEX "ProjectProposalVariant_proposalId_sortOrder_idx" ON "ProjectProposalVariant"("proposalId", "sortOrder");
CREATE INDEX "ProjectProposalSection_variantId_sortOrder_idx" ON "ProjectProposalSection"("variantId", "sortOrder");
CREATE INDEX "ProjectProposalSection_categoryId_idx" ON "ProjectProposalSection"("categoryId");
CREATE INDEX "ProjectProposalItem_sectionId_sortOrder_idx" ON "ProjectProposalItem"("sectionId", "sortOrder");
CREATE INDEX "ProjectProposalItem_contractorId_idx" ON "ProjectProposalItem"("contractorId");
CREATE INDEX "ProjectProposalItem_offerId_idx" ON "ProjectProposalItem"("offerId");
CREATE UNIQUE INDEX "ProjectProposalSnapshot_proposalId_versionNumber_key" ON "ProjectProposalSnapshot"("proposalId", "versionNumber");
CREATE INDEX "ProjectProposalSnapshot_createdById_idx" ON "ProjectProposalSnapshot"("createdById");
CREATE UNIQUE INDEX "ProjectProposalEstimateLink_proposalItemId_estimateVersionId_key" ON "ProjectProposalEstimateLink"("proposalItemId", "estimateVersionId");
CREATE INDEX "ProjectProposalEstimateLink_estimateVersionId_idx" ON "ProjectProposalEstimateLink"("estimateVersionId");
CREATE INDEX "ProjectProposalEstimateLink_estimateLineId_idx" ON "ProjectProposalEstimateLink"("estimateLineId");
CREATE INDEX "ProjectProposalEstimateLink_transferredById_idx" ON "ProjectProposalEstimateLink"("transferredById");

ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractorContact" ADD CONSTRAINT "ContractorContact_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorAsset" ADD CONSTRAINT "ContractorAsset_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorAsset" ADD CONSTRAINT "ContractorAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractorOffer" ADD CONSTRAINT "ContractorOffer_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractorOffer" ADD CONSTRAINT "ContractorOffer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractorCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractorOffer" ADD CONSTRAINT "ContractorOffer_priceConfirmedById_fkey" FOREIGN KEY ("priceConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractorOfferPriceHistory" ADD CONSTRAINT "ContractorOfferPriceHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContractorOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorOfferPriceHistory" ADD CONSTRAINT "ContractorOfferPriceHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProposal" ADD CONSTRAINT "ProjectProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProposal" ADD CONSTRAINT "ProjectProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProposal" ADD CONSTRAINT "ProjectProposal_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalVariant" ADD CONSTRAINT "ProjectProposalVariant_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ProjectProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalSection" ADD CONSTRAINT "ProjectProposalSection_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProjectProposalVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalSection" ADD CONSTRAINT "ProjectProposalSection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractorCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalItem" ADD CONSTRAINT "ProjectProposalItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProjectProposalSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalItem" ADD CONSTRAINT "ProjectProposalItem_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalItem" ADD CONSTRAINT "ProjectProposalItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContractorOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalSnapshot" ADD CONSTRAINT "ProjectProposalSnapshot_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ProjectProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalSnapshot" ADD CONSTRAINT "ProjectProposalSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalEstimateLink" ADD CONSTRAINT "ProjectProposalEstimateLink_proposalItemId_fkey" FOREIGN KEY ("proposalItemId") REFERENCES "ProjectProposalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalEstimateLink" ADD CONSTRAINT "ProjectProposalEstimateLink_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "ProjectEstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalEstimateLink" ADD CONSTRAINT "ProjectProposalEstimateLink_estimateLineId_fkey" FOREIGN KEY ("estimateLineId") REFERENCES "ProjectEstimateLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProposalEstimateLink" ADD CONSTRAINT "ProjectProposalEstimateLink_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_revision_nonnegative" CHECK ("revision" >= 0);
ALTER TABLE "ContractorOffer" ADD CONSTRAINT "ContractorOffer_revision_nonnegative" CHECK ("revision" >= 0);
ALTER TABLE "ProjectProposal" ADD CONSTRAINT "ProjectProposal_revision_nonnegative" CHECK ("revision" >= 0);
ALTER TABLE "ProjectProposalItem" ADD CONSTRAINT "ProjectProposalItem_qty_positive" CHECK ("qty" > 0);
ALTER TABLE "ContractorAsset" ADD CONSTRAINT "ContractorAsset_focal_range" CHECK (("focalX" IS NULL OR ("focalX" >= 0 AND "focalX" <= 1)) AND ("focalY" IS NULL OR ("focalY" >= 0 AND "focalY" <= 1)));

INSERT INTO "ContractorCategory" ("id", "name", "normalizedName", "description", "sortOrder", "updatedAt") VALUES
  ('contractor_category_locations', 'Локации', 'локации', 'Площадки, залы и открытые пространства', 0, CURRENT_TIMESTAMP),
  ('contractor_category_hosts', 'Ведущие', 'ведущие', 'Ведущие, модераторы и артисты разговорного жанра', 1, CURRENT_TIMESTAMP),
  ('contractor_category_show', 'Шоу-программа', 'шоупрограмма', 'Артисты, номера и интерактивные программы', 2, CURRENT_TIMESTAMP),
  ('contractor_category_equipment', 'Оборудование', 'оборудование', 'Звук, свет, экраны и техническое обеспечение', 3, CURRENT_TIMESTAMP),
  ('contractor_category_catering', 'Кейтеринг', 'кейтеринг', 'Еда, напитки и выездное обслуживание', 4, CURRENT_TIMESTAMP),
  ('contractor_category_decor', 'Декор', 'декор', 'Оформление, флористика и мебель', 5, CURRENT_TIMESTAMP),
  ('contractor_category_photo', 'Фото и видео', 'фотоивидео', 'Фотографы, видеографы и контент-команды', 6, CURRENT_TIMESTAMP),
  ('contractor_category_logistics', 'Логистика', 'логистика', 'Транспорт, доставка и персонал', 7, CURRENT_TIMESTAMP);
