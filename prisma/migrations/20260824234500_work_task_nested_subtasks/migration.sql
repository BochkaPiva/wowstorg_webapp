ALTER TABLE "WorkTaskChecklistItem"
  ADD COLUMN IF NOT EXISTS "parentId" TEXT;

DROP INDEX IF EXISTS "WorkTaskChecklistItem_taskId_sortOrder_idx";
CREATE INDEX IF NOT EXISTS "WorkTaskChecklistItem_taskId_parentId_sortOrder_idx"
  ON "WorkTaskChecklistItem"("taskId", "parentId", "sortOrder");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WorkTaskChecklistItem_parentId_fkey'
  ) THEN
    ALTER TABLE "WorkTaskChecklistItem"
      ADD CONSTRAINT "WorkTaskChecklistItem_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "WorkTaskChecklistItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
