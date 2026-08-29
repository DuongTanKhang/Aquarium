CREATE INDEX "categories_isActive_name_idx" ON "categories"("isActive", "name");

CREATE INDEX "products_status_createdAt_idx" ON "products"("status", "createdAt");

CREATE INDEX "products_status_price_idx" ON "products"("status", "price");
