CREATE TABLE "BrowserPushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BrowserPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrowserPushSubscription_endpoint_key" ON "BrowserPushSubscription"("endpoint");
CREATE INDEX "BrowserPushSubscription_userId_disabledAt_idx" ON "BrowserPushSubscription"("userId", "disabledAt");
CREATE INDEX "BrowserPushSubscription_disabledAt_idx" ON "BrowserPushSubscription"("disabledAt");

ALTER TABLE "BrowserPushSubscription"
ADD CONSTRAINT "BrowserPushSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
