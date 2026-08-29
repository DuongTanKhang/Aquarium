-- Keep the original methods for existing historical payments while adding the
-- provider methods exposed by the US storefront checkout.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'APPLE_PAY';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GOOGLE_PAY';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAYPAL';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ACH';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'VENMO';
