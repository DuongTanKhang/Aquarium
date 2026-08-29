-- Idempotency key prevents a browser retry/double click from creating a
-- second order. PostgreSQL allows multiple NULLs in a unique index, so this
-- remains backwards compatible with existing orders.
ALTER TABLE "orders" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");

-- Bound inventory reservations for pending provider checkouts.
ALTER TABLE "payments" ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3);
CREATE INDEX "payments_status_checkoutExpiresAt_idx" ON "payments"("status", "checkoutExpiresAt");
