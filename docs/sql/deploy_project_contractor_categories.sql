-- Run after deploy_project_contractors.sql, after backup, before deploying this client.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('project_contractor_categories_v1'));
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'ProjectContractor' AND column_name = 'categoryNames') THEN
    ALTER TABLE public."ProjectContractor" ADD COLUMN "categoryNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    UPDATE public."ProjectContractor" AS roster SET "categoryNames" = categories.names
    FROM (
      SELECT offers."contractorId", (array_agg(DISTINCT category.name ORDER BY category.name))[1:12] AS names
      FROM public."ContractorOffer" offers JOIN public."ContractorCategory" category ON category.id = offers."categoryId"
      WHERE offers."isActive" = true GROUP BY offers."contractorId"
    ) categories WHERE roster."contractorId" = categories."contractorId";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ProjectContractor'
      AND column_name = 'categoryNames' AND udt_name = '_text' AND is_nullable = 'NO'
  ) THEN RAISE EXCEPTION 'Unexpected ProjectContractor.categoryNames schema'; END IF;
END $$;
COMMIT;
SELECT 'PROJECT_CONTRACTOR_CATEGORIES_READY' AS result;
