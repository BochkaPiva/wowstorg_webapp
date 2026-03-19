-- Allow Greenwich employees rating to be manually locked by admins.

ALTER TABLE "GreenwichRating"
  ADD COLUMN "manualLocked" BOOLEAN NOT NULL DEFAULT FALSE;

