import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { jest } from "@jest/globals";
import cookieParser from "cookie-parser";
import { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { EmailService } from "../src/modules/auth/email.service.js";

interface AuthBody {
  accessToken: string;
}

interface CategoryBody {
  id: string;
  slug: string;
}

interface ProductBody {
  id: string;
  slug: string;
  status: string;
  price: string;
  images: Array<{ isPrimary: boolean }>;
}

const describeWithDatabase =
  process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("Catalog flow (e2e)", () => {
  let app: NestExpressApplication;
  let server: Server;
  let prisma: PrismaService;
  let accessToken: string;
  let categoryId: string;
  let productId: string;
  const email = `catalog-e2e-${Date.now()}@example.com`;
  const password = "Catalog-Correct-Horse-123!";

  beforeAll(async () => {
    jest
      .spyOn(EmailService.prototype, "sendVerificationEmail")
      .mockImplementation(() => Promise.resolve());

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix("api/v1");
    app.set("trust proxy", 1);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const register = await request(server)
      .post("/api/v1/auth/register")
      .send({ email, password, fullName: "Catalog Staff", phone: "+14155550101" })
      .expect(201);
    accessToken = (register.body as AuthBody).accessToken;
    await prisma.user.update({ where: { email }, data: { role: "STAFF" } });
  });

  afterAll(async () => {
    if (prisma) {
      if (productId) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      await prisma.user.deleteMany({ where: { email } });
    }
    if (app) await app.close();
    jest.restoreAllMocks();
  });

  it("creates a category and prevents duplicate slugs", async () => {
    const response = await request(server)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cá nhiệt đới", description: "Nhóm cá nước ngọt" })
      .expect(201);
    const category = response.body as CategoryBody;
    categoryId = category.id;
    expect(category.slug).toBe("ca-nhiet-doi");

    await request(server)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Danh mục trùng", slug: category.slug })
      .expect(409);

    const publicList = await request(server)
      .get("/api/v1/categories?page=1&pageSize=10")
      .expect(200);
    expect((publicList.body as { data: unknown[] }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: categoryId, slug: category.slug }),
      ]),
    );
  });

  it("creates and filters products while keeping draft products private", async () => {
    const createResponse = await request(server)
      .post("/api/v1/admin/products")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        categoryId,
        sku: "FISH-NEON-001",
        name: "Cá Neon vua",
        type: "FISH",
        price: "35000.00",
        costPrice: "18000.00",
        stockQuantity: 12,
        images: [
          {
            url: "https://cdn.example.com/neon.jpg",
            isPrimary: true,
          },
        ],
      })
      .expect(201);
    const product = createResponse.body as ProductBody;
    productId = product.id;
    expect(product.slug).toBe("ca-neon-vua");
    expect(product.price).toBe("35000.00");
    expect(product.images).toHaveLength(1);
    expect(product.images[0].isPrimary).toBe(true);

    await request(server).get(`/api/v1/products/${product.slug}`).expect(404);

    await request(server)
      .patch(`/api/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "ACTIVE" })
      .expect(200);

    const publicResponse = await request(server)
      .get(
        "/api/v1/products?type=FISH&minPrice=30000&maxPrice=40000&inStock=true",
      )
      .expect(200);
    expect((publicResponse.body as { data: unknown[] }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: productId, inStock: true, availableQuantity: 12 }),
      ]),
    );

    await request(server)
      .post("/api/v1/admin/products")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        categoryId,
        sku: "FISH-NEON-002",
        name: "Tên khác",
        slug: "ca-neon-vua",
        type: "FISH",
        price: "40000",
      })
      .expect(409);
  });

  it("blocks deleting a category that contains products and limits staff delete", async () => {
    await request(server)
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);

    await request(server)
      .delete(`/api/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });
});
