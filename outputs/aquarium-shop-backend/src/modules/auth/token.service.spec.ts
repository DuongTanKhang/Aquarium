import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { User } from "../../generated/prisma/client.js";
import { TokenService } from "./token.service.js";

interface VerifiedAccessToken {
  sub: string;
  sid: string;
  email: string;
  role: string;
  typ: string;
  jti: string;
}

describe("TokenService", () => {
  const values: Record<string, string | number> = {
    JWT_ACCESS_SECRET:
      "test-access-secret-that-is-long-enough-for-auth-tests-0123456789abcdef",
    REFRESH_TOKEN_PEPPER:
      "test-refresh-pepper-that-is-long-enough-for-auth-tests-0123456789abc",
    JWT_ISSUER: "aquarium-shop-api",
    JWT_AUDIENCE: "aquarium-shop-web",
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_SECONDS: 604800,
  };
  const config = {
    getOrThrow: <T>(key: string): T => values[key] as T,
  } as ConfigService;
  const jwtService = new JwtService({
    secret: values.JWT_ACCESS_SECRET,
  });
  const service = new TokenService(jwtService, config);
  const user: User = {
    id: "10000000-0000-4000-8000-000000000001",
    email: "admin@example.com",
    passwordHash: "not-used-here",
    fullName: "Admin",
    phone: null,
    role: "ADMIN",
    status: "ACTIVE",
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: new Date(),
    avatarUrl: null,
    address: null,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    mfaEnabled: false,
    mfaSecretEncrypted: null,
    mfaPendingEncrypted: null,
    mfaVerifiedAt: null,
    mfaLastUsedStep: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("signs an access token with fixed issuer, audience, type, and algorithm", async () => {
    const token = await service.signAccessToken(
      user,
      "20000000-0000-4000-8000-000000000001",
    );
    const payload = (await jwtService.verifyAsync(token, {
      secret: values.JWT_ACCESS_SECRET,
      audience: values.JWT_AUDIENCE as string,
      issuer: values.JWT_ISSUER as string,
      algorithms: ["HS256"],
    })) as unknown as VerifiedAccessToken;

    expect(payload).toMatchObject({
      sub: user.id,
      sid: "20000000-0000-4000-8000-000000000001",
      email: user.email,
      role: user.role,
      typ: "access",
    });
    expect(payload.jti).toBeDefined();
  });

  it("creates unique opaque refresh tokens and deterministic keyed hashes", () => {
    const first = service.createRefreshToken();
    const second = service.createRefreshToken();

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.rawToken).not.toBe(first.tokenHash);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashRefreshToken(first.rawToken)).toBe(first.tokenHash);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
