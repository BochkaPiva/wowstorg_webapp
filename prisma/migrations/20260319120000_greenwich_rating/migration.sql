-- Greenwich rating (per user) + per-order delta components for idempotent recompute

CREATE TABLE "GreenwichRating" (
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 100,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreenwichRating_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "GreenwichRating" ADD CONSTRAINT "GreenwichRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "greenwichRatingOverdueDelta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "greenwichRatingIncidentsDelta" INTEGER NOT NULL DEFAULT 0;
