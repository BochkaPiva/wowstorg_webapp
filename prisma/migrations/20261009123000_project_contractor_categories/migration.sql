ALTER TABLE "ProjectContractor" ADD COLUMN "categoryNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Only catalog metadata; never guess categories from free-text responsibilities.
UPDATE "ProjectContractor" AS roster SET "categoryNames" = categories.names
FROM (
  SELECT offers."contractorId", (array_agg(DISTINCT category.name ORDER BY category.name))[1:12] AS names
  FROM "ContractorOffer" offers JOIN "ContractorCategory" category ON category.id = offers."categoryId"
  WHERE offers."isActive" = true GROUP BY offers."contractorId"
) categories WHERE roster."contractorId" = categories."contractorId";
