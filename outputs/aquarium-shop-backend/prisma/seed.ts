import "dotenv/config";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) {
      throw new Error(
        "SEED_ADMIN_PASSWORD must contain at least 12 characters",
      );
    }

    const passwordHash = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash,
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
      create: {
        email: adminEmail,
        fullName: "Aquarium Admin",
        passwordHash,
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
  } else {
    console.warn(
      "Skipping admin seed: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create it.",
    );
  }

  const categories = [
    { name: "Cá cảnh", slug: "ca-canh" },
    { name: "Bể cá", slug: "be-ca" },
    { name: "Thức ăn", slug: "thuc-an" },
    { name: "Phụ kiện", slug: "phu-kien" },
    { name: "Cây thủy sinh", slug: "cay-thuy-sinh" },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
