import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { User } from "../../generated/prisma/client.js";
import { AccessTokenPayload, MfaTicketPayload } from "./types/auth.types.js";

interface GeneratedRefreshToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(user: User, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      email: user.email,
      role: user.role,
      typ: "access",
    };
    const options: JwtSignOptions = {
      algorithm: "HS256",
      audience: this.config.getOrThrow<string>("JWT_AUDIENCE"),
      issuer: this.config.getOrThrow<string>("JWT_ISSUER"),
      expiresIn: this.accessTokenTtlSeconds,
      jwtid: randomUUID(),
    };

    return this.jwtService.signAsync(payload, options);
  }

  createRefreshToken(): GeneratedRefreshToken {
    const rawToken = randomBytes(48).toString("base64url");

    return {
      rawToken,
      tokenHash: this.hashRefreshToken(rawToken),
      expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
    };
  }

  signMfaTicket(userId: string, challengeId: string): Promise<string> {
    const payload: MfaTicketPayload = {
      sub: userId,
      cid: challengeId,
      typ: "mfa",
    };

    return this.jwtService.signAsync(payload, {
      algorithm: "HS256",
      audience: this.config.getOrThrow<string>("JWT_AUDIENCE"),
      issuer: this.config.getOrThrow<string>("JWT_ISSUER"),
      expiresIn: this.mfaChallengeTtlSeconds,
      jwtid: randomUUID(),
    });
  }

  async verifyMfaTicket(token: string): Promise<MfaTicketPayload> {
    const payload: unknown = await this.jwtService.verifyAsync(token, {
      algorithms: ["HS256"],
      audience: this.config.getOrThrow<string>("JWT_AUDIENCE"),
      issuer: this.config.getOrThrow<string>("JWT_ISSUER"),
    });

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("sub" in payload) ||
      !("cid" in payload) ||
      !("typ" in payload) ||
      typeof payload.sub !== "string" ||
      typeof payload.cid !== "string" ||
      payload.typ !== "mfa"
    ) {
      throw new Error("Invalid MFA ticket");
    }

    return { sub: payload.sub, cid: payload.cid, typ: "mfa" };
  }

  hashRefreshToken(rawToken: string): string {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("REFRESH_TOKEN_PEPPER"),
    )
      .update(rawToken, "utf8")
      .digest("hex");
  }

  get accessTokenTtlSeconds(): number {
    return this.config.getOrThrow<number>("JWT_ACCESS_TTL_SECONDS");
  }

  get refreshTokenTtlSeconds(): number {
    return this.config.getOrThrow<number>("REFRESH_TOKEN_TTL_SECONDS");
  }

  get mfaChallengeTtlSeconds(): number {
    return this.config.getOrThrow<number>("MFA_CHALLENGE_TTL_SECONDS");
  }
}
