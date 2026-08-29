CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorites_userId_productId_key" ON "favorites"("userId", "productId");
CREATE INDEX "favorites_userId_createdAt_idx" ON "favorites"("userId", "createdAt");
CREATE INDEX "favorites_productId_idx" ON "favorites"("productId");
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'storefront',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");
CREATE INDEX "newsletter_subscribers_subscribedAt_idx" ON "newsletter_subscribers"("subscribedAt");
CREATE INDEX "newsletter_subscribers_unsubscribedAt_idx" ON "newsletter_subscribers"("unsubscribedAt");

CREATE TYPE "ContactMessageStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM');
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ContactMessageStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contact_messages_status_createdAt_idx" ON "contact_messages"("status", "createdAt");
CREATE INDEX "contact_messages_email_createdAt_idx" ON "contact_messages"("email", "createdAt");
