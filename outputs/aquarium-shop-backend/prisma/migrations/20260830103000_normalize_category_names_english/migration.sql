-- Keep the existing slugs for backwards-compatible URLs while presenting
-- customer and admin category names in English consistently.
UPDATE "categories" SET "name" = 'Tropical fish' WHERE "slug" = 'ca-canh';
UPDATE "categories" SET "name" = 'Aquariums' WHERE "slug" = 'be-ca';
UPDATE "categories" SET "name" = 'Fish food' WHERE "slug" = 'thuc-an';
UPDATE "categories" SET "name" = 'Accessories' WHERE "slug" = 'phu-kien';
UPDATE "categories" SET "name" = 'Aquatic plants' WHERE "slug" = 'cay-thuy-sinh';
