import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { jest } from "@jest/globals";
import cookieParser from "cookie-parser";
import { createHmac } from "node:crypto";
import { Server } from "node:http";
import request, { Response as SupertestResponse } from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { EmailService } from "../src/modules/auth/email.service.js";

interface AuthBody {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface MfaPendingBody {
  mfaRequired: true;
  mfaTicket: string;
  expiresIn: number;
}

const describeWithDatabase =
  process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function getCookie(response: SupertestResponse): string {
  const header: unknown = response.headers["set-cookie"];

  if (!Array.isArray(header) || typeof header[0] !== "string") {
    throw new Error("Expected a Set-Cookie response header");
  }

  return header[0].split(";", 1)[0];
}

function decodeBase32(input: string): Buffer {
  let bits = "";

  for (const character of input.replace(/=+$/, "")) {
    const value = BASE32_ALPHABET.indexOf(character.toUpperCase());
    if (value < 0) throw new Error("Invalid base32 secret");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const step = Math.floor(Date.now() / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

describeWithDatabase("Authentication flow (e2e)", () => {
  let app: NestExpressApplication;
  let server: Server;
  let prisma: PrismaService;
  let verificationToken = "";
  let resetToken = "";
  let activePassword = "Correct-Horse-Battery-123!";
  const email = `auth-e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    jest
      .spyOn(EmailService.prototype, "sendVerificationEmail")
      .mockImplementation((_recipient, _fullName, rawToken) => {
        verificationToken = rawToken;
        return Promise.resolve();
      });
    jest
      .spyOn(EmailService.prototype, "sendPasswordResetEmail")
      .mockImplementation((_recipient, _fullName, rawToken) => {
        resetToken = rawToken;
        return Promise.resolve();
      });

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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email } });
    }
    if (app) {
      await app.close();
    }
    jest.restoreAllMocks();
  });

  it("registers, authorizes, rotates tokens, and detects refresh reuse", async () => {
    const registerResponse = await request(server)
      .post("/api/v1/auth/register")
      .send({ email, password: activePassword, fullName: "Auth Test Customer", phone: "+14155550102" })
      .expect(201);
    const registerBody = registerResponse.body as AuthBody;
    const firstRefreshCookie = getCookie(registerResponse);

    expect(registerBody.user.email).toBe(email);
    expect(registerBody.user.role).toBe("CUSTOMER");
    expect(registerBody).not.toHaveProperty("refreshToken");
    expect(verificationToken).toHaveLength(64);

    await request(server)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${registerBody.accessToken}`)
      .expect(200);

    await request(server)
      .get("/api/v1/admin/dashboard/summary")
      .set("Authorization", `Bearer ${registerBody.accessToken}`)
      .expect(403);

    const refreshResponse = await request(server)
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstRefreshCookie)
      .expect(200);
    const secondRefreshCookie = getCookie(refreshResponse);

    expect(secondRefreshCookie).not.toBe(firstRefreshCookie);

    await request(server)
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstRefreshCookie)
      .expect(401);

    await request(server)
      .post("/api/v1/auth/refresh")
      .set("Cookie", secondRefreshCookie)
      .expect(401);
  });

  it("verifies email once with a hashed, expiring token", async () => {
    await request(server)
      .post("/api/v1/auth/email/verify")
      .send({ token: verificationToken })
      .expect(200);

    await request(server)
      .post("/api/v1/auth/email/verify")
      .send({ token: verificationToken })
      .expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("resets the password, consumes the token, and revokes prior sessions", async () => {
    const oldLogin = await request(server)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.20")
      .send({ email, password: activePassword })
      .expect(200);
    const oldAccessToken = (oldLogin.body as AuthBody).accessToken;

    await request(server)
      .post("/api/v1/auth/password/forgot")
      .set("X-Forwarded-For", "198.51.100.21")
      .send({ email })
      .expect(202);
    expect(resetToken).toHaveLength(6);

    const nextPassword = "New-Correct-Horse-Battery-456!";
    await request(server)
      .post("/api/v1/auth/password/reset")
      .set("X-Forwarded-For", "198.51.100.22")
      .send({ token: resetToken, newPassword: nextPassword })
      .expect(204);

    await request(server)
      .post("/api/v1/auth/password/reset")
      .set("X-Forwarded-For", "198.51.100.23")
      .send({ token: resetToken, newPassword: nextPassword })
      .expect(401);

    await request(server)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${oldAccessToken}`)
      .expect(401);

    await request(server)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.24")
      .send({ email, password: activePassword })
      .expect(401);

    activePassword = nextPassword;
    await request(server)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.25")
      .send({ email, password: activePassword })
      .expect(200);
  });

  it("requires MFA for admins and accepts each MFA challenge/recovery code once", async () => {
    const loginResponse = await request(server)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.30")
      .send({ email, password: activePassword })
      .expect(200);
    const loginBody = loginResponse.body as AuthBody;

    await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
    });

    await request(server)
      .get("/api/v1/admin/dashboard/summary")
      .set("Authorization", `Bearer ${loginBody.accessToken}`)
      .expect(403);

    const setupResponse = await request(server)
      .post("/api/v1/auth/mfa/setup")
      .set("Authorization", `Bearer ${loginBody.accessToken}`)
      .expect(200);
    const setup = setupResponse.body as {
      manualKey: string;
      otpauthUri: string;
    };
    expect(setup.otpauthUri).toContain("otpauth://totp/");

    const enableResponse = await request(server)
      .post("/api/v1/auth/mfa/enable")
      .set("Authorization", `Bearer ${loginBody.accessToken}`)
      .send({ code: currentTotp(setup.manualKey) })
      .expect(200);
    const recoveryCodes = (enableResponse.body as { recoveryCodes: string[] })
      .recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);

    await request(server)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loginBody.accessToken}`)
      .expect(401);

    const pendingResponse = await request(server)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.31")
      .send({ email, password: activePassword })
      .expect(200);
    const pending = pendingResponse.body as MfaPendingBody;
    expect(pending.mfaRequired).toBe(true);
    expect(pendingResponse.headers["set-cookie"]).toBeUndefined();

    const completedResponse = await request(server)
      .post("/api/v1/auth/mfa/verify-login")
      .set("X-Forwarded-For", "198.51.100.32")
      .send({ mfaTicket: pending.mfaTicket, code: recoveryCodes[0] })
      .expect(200);
    const completed = completedResponse.body as AuthBody;
    getCookie(completedResponse);

    await request(server)
      .get("/api/v1/admin/dashboard/summary")
      .set("Authorization", `Bearer ${completed.accessToken}`)
      .expect(200);

    await request(server)
      .post("/api/v1/auth/mfa/verify-login")
      .set("X-Forwarded-For", "198.51.100.33")
      .send({ mfaTicket: pending.mfaTicket, code: recoveryCodes[0] })
      .expect(401);
  });

  it("locks the account temporarily after repeated password failures", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(server)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", "198.51.100.40")
        .send({ email, password: "definitely-wrong-password" })
        .expect(401);
    }

    await request(server)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.41")
      .send({ email, password: activePassword })
      .expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });
});
