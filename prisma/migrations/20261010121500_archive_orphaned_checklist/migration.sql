-- Approved recovery of seven checklist rows whose parent tasks no longer exist.
-- The archive is private, outside public/Data API and retains full rows + assignees.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA IF NOT EXISTS maintenance;
REVOKE ALL ON SCHEMA maintenance FROM PUBLIC;
CREATE TABLE IF NOT EXISTS maintenance."OrphanedChecklistArchive" (
  "sourceTable" text NOT NULL,
  "sourceId" text NOT NULL,
  "rowData" jsonb NOT NULL,
  "archivedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" text NOT NULL DEFAULT 'Parent WorkTask missing; recovery approved 2026-10-10',
  PRIMARY KEY ("sourceTable", "sourceId")
);
ALTER TABLE maintenance."OrphanedChecklistArchive" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON maintenance."OrphanedChecklistArchive" FROM PUBLIC;
DO $archive$
DECLARE
  affected integer;
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA maintenance FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON maintenance."OrphanedChecklistArchive" FROM %I', api_role);
    END IF;
  END LOOP;
  -- Lock both tables to keep the archive/delete set stable until constraints follow.
  LOCK TABLE "WorkTask", "WorkTaskChecklistItem", "WorkTaskChecklistAssignee" IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO affected FROM "WorkTaskChecklistItem" c
    WHERE NOT EXISTS (SELECT 1 FROM "WorkTask" t WHERE t.id=c."taskId");
  IF affected > 7 THEN RAISE EXCEPTION 'More orphan rows than approved: %', affected; END IF;
  -- Do not let a corrupt parent link cascade to a live task's checklist.
  IF EXISTS (SELECT 1 FROM "WorkTaskChecklistItem" child JOIN "WorkTaskChecklistItem" parent ON parent.id=child."parentId"
    WHERE NOT EXISTS (SELECT 1 FROM "WorkTask" t WHERE t.id=parent."taskId")
    AND EXISTS (SELECT 1 FROM "WorkTask" t WHERE t.id=child."taskId")) THEN
    RAISE EXCEPTION 'Orphan parent references a live checklist; manual review required';
  END IF;
  INSERT INTO maintenance."OrphanedChecklistArchive" ("sourceTable","sourceId","rowData")
    SELECT 'WorkTaskChecklistItem', c.id, to_jsonb(c) FROM "WorkTaskChecklistItem" c
    WHERE NOT EXISTS (SELECT 1 FROM "WorkTask" t WHERE t.id=c."taskId")
    ON CONFLICT DO NOTHING;
  INSERT INTO maintenance."OrphanedChecklistArchive" ("sourceTable","sourceId","rowData")
    SELECT 'WorkTaskChecklistAssignee', a."checklistItemId" || ':' || a."userId", to_jsonb(a)
    FROM "WorkTaskChecklistAssignee" a JOIN "WorkTaskChecklistItem" c ON c.id=a."checklistItemId"
    WHERE NOT EXISTS (SELECT 1 FROM "WorkTask" t WHERE t.id=c."taskId")
    ON CONFLICT DO NOTHING;
  -- Verify every exact row was archived before a cascading delete can occur.
  IF EXISTS (SELECT 1 FROM "WorkTaskChecklistItem" c
    WHERE NOT EXISTS (SELECT 1 FROM "WorkTask" t WHERE t.id=c."taskId")
    AND NOT EXISTS (SELECT 1 FROM maintenance."OrphanedChecklistArchive" a
      WHERE a."sourceTable"='WorkTaskChecklistItem' AND a."sourceId"=c.id AND a."rowData"=to_jsonb(c))) THEN
    RAISE EXCEPTION 'Archive mismatch; no rows may be removed';
  END IF;
  DELETE FROM "WorkTaskChecklistItem" c
    WHERE NOT EXISTS (SELECT 1 FROM "WorkTask" t WHERE t.id=c."taskId");
END
$archive$;
COMMIT;
