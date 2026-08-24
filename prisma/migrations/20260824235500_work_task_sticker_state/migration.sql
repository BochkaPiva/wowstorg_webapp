ALTER TABLE "WorkTask"
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dueTimeMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "reminderText" TEXT,
  ADD COLUMN IF NOT EXISTS "priorityStickerEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "priorityStickerConfigured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deadlineStickerEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reminderStickerEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "assigneeStickerEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkTaskChecklistItem"
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dueTimeMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "reminderText" TEXT,
  ADD COLUMN IF NOT EXISTS "priorityStickerEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "priorityStickerConfigured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deadlineStickerEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reminderStickerEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "assigneeStickerEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WorkTask"
SET
  "priorityStickerEnabled" = ("priority" <> 'NORMAL'),
  "priorityStickerConfigured" = ("priority" <> 'NORMAL'),
  "deadlineStickerEnabled" = ("dueDate" IS NOT NULL),
  "reminderStickerEnabled" = ("reminderAt" IS NOT NULL),
  "assigneeStickerEnabled" = ("assigneeUserId" IS NOT NULL);

UPDATE "WorkTaskChecklistItem"
SET
  "priorityStickerEnabled" = ("priority" <> 'NORMAL'),
  "priorityStickerConfigured" = ("priority" <> 'NORMAL'),
  "deadlineStickerEnabled" = ("dueDate" IS NOT NULL),
  "reminderStickerEnabled" = ("reminderAt" IS NOT NULL),
  "assigneeStickerEnabled" = ("assigneeUserId" IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkTask_dueTimeMinutes_check'
  ) THEN
    ALTER TABLE "WorkTask"
      ADD CONSTRAINT "WorkTask_dueTimeMinutes_check"
      CHECK ("dueTimeMinutes" IS NULL OR "dueTimeMinutes" BETWEEN 0 AND 1439);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkTaskChecklistItem_dueTimeMinutes_check'
  ) THEN
    ALTER TABLE "WorkTaskChecklistItem"
      ADD CONSTRAINT "WorkTaskChecklistItem_dueTimeMinutes_check"
      CHECK ("dueTimeMinutes" IS NULL OR "dueTimeMinutes" BETWEEN 0 AND 1439);
  END IF;
END $$;
