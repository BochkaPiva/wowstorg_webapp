CREATE TABLE IF NOT EXISTS "ArchiveRegisterMark" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT UNIQUE, "orderId" TEXT UNIQUE,
  "recorded" BOOLEAN NOT NULL DEFAULT false, "updatedById" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArchiveRegisterMark_target_check" CHECK (("projectId" IS NOT NULL)::int + ("orderId" IS NOT NULL)::int = 1),
  CONSTRAINT "ArchiveRegisterMark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ArchiveRegisterMark_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ArchiveDocument" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT, "orderId" TEXT, "storageKey" TEXT NOT NULL UNIQUE,
  "originalName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArchiveDocument_target_check" CHECK (("projectId" IS NOT NULL)::int + ("orderId" IS NOT NULL)::int = 1),
  CONSTRAINT "ArchiveDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ArchiveDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ArchiveDocument_projectId_idx" ON "ArchiveDocument"("projectId");
CREATE INDEX IF NOT EXISTS "ArchiveDocument_orderId_idx" ON "ArchiveDocument"("orderId");
ALTER TABLE "ArchiveRegisterMark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArchiveDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ArchiveRegisterMark", "ArchiveDocument" FROM PUBLIC, anon, authenticated;
