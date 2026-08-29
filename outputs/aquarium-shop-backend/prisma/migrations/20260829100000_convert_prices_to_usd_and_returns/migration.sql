-- Existing seed/catalog values were entered as Vietnamese dong.  The store
-- now stores and displays USD; this one-time conversion uses 25,000 VND = 1 USD.
UPDATE "products"
SET "price" = ROUND("price" / 25000.0, 2),
    "costPrice" = CASE WHEN "costPrice" IS NULL THEN NULL ELSE ROUND("costPrice" / 25000.0, 2) END;

CREATE TYPE "ReturnRequestType" AS ENUM ('REFUND', 'RETURN', 'EXCHANGE');
CREATE TYPE "ReturnRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'COMPLETED');

CREATE TABLE "return_requests" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "ReturnRequestType" NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "adminNote" TEXT,
    "resolutionNote" TEXT,
    "providerRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "return_requests_customerId_createdAt_idx" ON "return_requests"("customerId", "createdAt");
CREATE INDEX "return_requests_orderId_createdAt_idx" ON "return_requests"("orderId", "createdAt");
CREATE INDEX "return_requests_status_createdAt_idx" ON "return_requests"("status", "createdAt");
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
