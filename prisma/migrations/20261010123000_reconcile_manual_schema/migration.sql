-- Converge manually provisioned production tables and a fresh migration replay.
-- Validates existing rows; never deletes or repairs orphaned business data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "BrowserPushSubscription" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "OrderNotificationCooldown" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX IF NOT EXISTS "ProjectEstimateVersion_projectId_isPrimary_idx"
  ON "ProjectEstimateVersion"("projectId", "isPrimary");
DO $converge$
DECLARE
  fk record;
  constraint_name text;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('WorkTaskBoard', 'createdById', 'User', 'RESTRICT'),
    ('WorkTaskColumn', 'boardId', 'WorkTaskBoard', 'CASCADE'),
    ('WorkTaskColumn', 'createdById', 'User', 'RESTRICT'),
    ('WorkTask', 'boardId', 'WorkTaskBoard', 'CASCADE'),
    ('WorkTask', 'columnId', 'WorkTaskColumn', 'RESTRICT'),
    ('WorkTask', 'createdById', 'User', 'RESTRICT'),
    ('WorkTask', 'assigneeUserId', 'User', 'SET NULL'),
    ('WorkTask', 'projectId', 'Project', 'SET NULL'),
    ('WorkTask', 'orderId', 'Order', 'SET NULL'),
    ('WorkTaskChecklistItem', 'taskId', 'WorkTask', 'CASCADE'),
    ('WorkTaskChecklistItem', 'createdById', 'User', 'RESTRICT')
  ) AS required(table_name, column_name, parent_table, delete_action)
  LOOP
    constraint_name := fk.table_name || '_' || fk.column_name || '_fkey';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', fk.table_name)::regclass AND conname = constraint_name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s ON UPDATE CASCADE',
        fk.table_name, constraint_name, fk.column_name, fk.parent_table, fk.delete_action);
    END IF;
  END LOOP;
  -- PostgreSQL truncated these historic identifiers to 63 bytes.
  IF to_regclass('public."FinancialReconciliationRow_matchedEntityType_matchedEntityId_id"') IS NOT NULL THEN
    ALTER INDEX "FinancialReconciliationRow_matchedEntityType_matchedEntityId_id"
      RENAME TO "FinancialReconciliationRow_matchedEntityType_matchedEntityI_idx";
  END IF;
  IF to_regclass('public."ProjectProposalEstimateLink_proposalItemId_estimateVersionId_ke"') IS NOT NULL THEN
    ALTER INDEX "ProjectProposalEstimateLink_proposalItemId_estimateVersionId_ke"
      RENAME TO "ProjectProposalEstimateLink_proposalItemId_estimateVersionI_key";
  END IF;
END
$converge$;
COMMIT;
