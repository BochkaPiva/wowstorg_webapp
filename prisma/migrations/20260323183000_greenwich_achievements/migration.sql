-- Create enums
CREATE TYPE "AchievementCode" AS ENUM (
  'PERFECT_ORDERS',
  'TOWER_SCORE',
  'ORDER_VOLUME',
  'BIGGEST_CHECK',
  'CLOSED_ORDERS',
  'NO_CANCEL_STREAK'
);

CREATE TYPE "AchievementLevel" AS ENUM ('NONE', 'BRONZE', 'SILVER', 'GOLD');

CREATE TYPE "InAppNotificationType" AS ENUM ('ACHIEVEMENT_UNLOCK');

-- Create achievement progress table
CREATE TABLE "AchievementProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" "AchievementCode" NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "level" "AchievementLevel" NOT NULL DEFAULT 'NONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AchievementProgress_pkey" PRIMARY KEY ("id")
);

-- Create unlock history table
CREATE TABLE "AchievementUnlock" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" "AchievementCode" NOT NULL,
  "level" "AchievementLevel" NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AchievementUnlock_pkey" PRIMARY KEY ("id")
);

-- Create tower stats table
CREATE TABLE "UserTowerStats" (
  "userId" TEXT NOT NULL,
  "bestScore" INTEGER NOT NULL DEFAULT 0,
  "lastScore" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserTowerStats_pkey" PRIMARY KEY ("userId")
);

-- Create in-app notifications table
CREATE TABLE "InAppNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "InAppNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payloadJson" JSONB,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "AchievementProgress_userId_code_key"
  ON "AchievementProgress"("userId", "code");
CREATE INDEX "AchievementProgress_userId_level_idx"
  ON "AchievementProgress"("userId", "level");

CREATE UNIQUE INDEX "AchievementUnlock_userId_code_level_key"
  ON "AchievementUnlock"("userId", "code", "level");
CREATE INDEX "AchievementUnlock_userId_unlockedAt_idx"
  ON "AchievementUnlock"("userId", "unlockedAt");

CREATE INDEX "InAppNotification_userId_isRead_createdAt_idx"
  ON "InAppNotification"("userId", "isRead", "createdAt");

-- Foreign keys
ALTER TABLE "AchievementProgress"
  ADD CONSTRAINT "AchievementProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AchievementUnlock"
  ADD CONSTRAINT "AchievementUnlock_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTowerStats"
  ADD CONSTRAINT "UserTowerStats_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InAppNotification"
  ADD CONSTRAINT "InAppNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
