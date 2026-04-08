-- Add planned rental days for project demo draft lines.

ALTER TABLE "ProjectDraftOrderLine"
ADD COLUMN "plannedDays" INTEGER NOT NULL DEFAULT 1;
