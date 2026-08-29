import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Server } from "node:http";
import request from "supertest";
import { PrismaService } from "../src/database/prisma.service.js";
import { HealthController } from "../src/modules/health/health.controller.js";

interface HealthResponse {
  status: string;
  timestamp: string;
}

describe("Health endpoint (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: async () => [{ ok: 1 }] },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("/api/v1/health (GET)", async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get("/api/v1/health").expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
