-- AlterEnum (PostgreSQL 12+: допустимо в транзакции миграции)
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_CONTACT_CREATED';
ALTER TYPE "ProjectActivityKind" ADD VALUE 'PROJECT_CONTACT_UPDATED';

-- CreateTable
CREATE TABLE "ProjectContact" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "roleNote" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_idx" ON "ProjectContact" ("projectId");

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_isActive_idx" ON "ProjectContact" ("projectId", "isActive");

-- AddForeignKey
ALTER TABLE "ProjectContact"
  ADD CONSTRAINT "ProjectContact_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ProjectCommunicationEntry" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectCommunicationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCommunicationEntry_contactId_createdAt_idx" ON "ProjectCommunicationEntry" ("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectCommunicationEntry"
  ADD CONSTRAINT "ProjectCommunicationEntry_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ProjectContact" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommunicationEntry"
  ADD CONSTRAINT "ProjectCommunicationEntry_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
