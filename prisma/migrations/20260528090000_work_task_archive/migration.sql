ALTER TABLE "WorkTask" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "WorkTask_archivedAt_idx" ON "WorkTask"("archivedAt");
