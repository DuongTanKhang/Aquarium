-- Keep provider identifiers queryable without scanning JSON payloads. The
-- backfill supports databases created before these columns existed.
ALTER TABLE "payments"
  ADD COLUMN "providerOrderId" TEXT,
  ADD COLUMN "providerCaptureId" TEXT;

UPDATE "payments"
SET "providerOrderId" = CASE
      WHEN jsonb_typeof("providerPayload") = 'object' THEN "providerPayload"->>'paypalOrderId'
      ELSE NULL
    END,
    "providerCaptureId" = CASE
      WHEN jsonb_typeof("providerPayload") = 'object' THEN COALESCE("providerPayload"->>'captureId', "transactionCode")
      ELSE "transactionCode"
    END
WHERE "providerPayload" IS NOT NULL;

CREATE UNIQUE INDEX "payments_providerOrderId_key" ON "payments"("providerOrderId");
CREATE UNIQUE INDEX "payments_providerCaptureId_key" ON "payments"("providerCaptureId");

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_eventId_key" ON "payment_webhook_events"("eventId");
CREATE INDEX "payment_webhook_events_provider_eventType_receivedAt_idx"
  ON "payment_webhook_events"("provider", "eventType", "receivedAt");
