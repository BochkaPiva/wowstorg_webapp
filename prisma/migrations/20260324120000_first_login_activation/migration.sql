-- Add first-login activation fields to users.
ALTER TABLE "User"
ADD COLUMN "mustSetPassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passwordSetAt" TIMESTAMP(3);

-- Existing users already have passwords, consider them activated.
UPDATE "User"
SET "mustSetPassword" = false,
    "passwordSetAt" = COALESCE("passwordSetAt", NOW())
WHERE "passwordHash" IS NOT NULL;
