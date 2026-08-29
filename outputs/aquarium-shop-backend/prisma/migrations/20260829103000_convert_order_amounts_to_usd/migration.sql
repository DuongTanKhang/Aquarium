-- Convert historical VND-denominated financial snapshots. New USD orders are
-- protected by the threshold so this remains safe if a database already has
-- post-cutover orders when the migration is deployed.
UPDATE "orders"
SET "subtotal" = ROUND("subtotal" / 25000.0, 2),
    "shippingFee" = ROUND("shippingFee" / 25000.0, 2),
    "discountAmount" = ROUND("discountAmount" / 25000.0, 2),
    "totalAmount" = ROUND("totalAmount" / 25000.0, 2)
WHERE "subtotal" > 1000 OR "shippingFee" > 1000 OR "discountAmount" > 1000 OR "totalAmount" > 1000;

UPDATE "order_items"
SET "unitPrice" = ROUND("unitPrice" / 25000.0, 2),
    "subtotal" = ROUND("subtotal" / 25000.0, 2)
WHERE "unitPrice" > 1000 OR "subtotal" > 1000;

UPDATE "payments"
SET "amount" = ROUND("amount" / 25000.0, 2)
WHERE "amount" > 1000;
