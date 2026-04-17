-- AlterEnum
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_FOLDER_CREATED';
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_FOLDER_RENAMED';
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_FOLDER_DELETED';
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_FILE_UPLOADED';
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_FILE_DELETED';

-- CreateTable
CREATE TABLE "ProjectFolder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFile_storageKey_key" ON "ProjectFile"("storageKey");

-- CreateIndex
CREATE INDEX "ProjectFolder_projectId_idx" ON "ProjectFolder"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFolder_projectId_parentFolderId_idx" ON "ProjectFolder"("projectId", "parentFolderId");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFile_folderId_idx" ON "ProjectFile"("folderId");

-- AddForeignKey
ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "ProjectFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ProjectFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
