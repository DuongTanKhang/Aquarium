import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { z } from "zod";
import { PrismaService } from "../../../database/prisma.service.js";
import { UserRole, UserStatus } from "../../../generated/prisma/enums.js";
import { AccessTokenPayload, AuthenticatedUser } from "../types/auth.types.js";

const accessTokenSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  typ: z.literal("access"),
});

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      issuer: config.getOrThrow<string>("JWT_ISSUER"),
      audience: config.getOrThrow<string>("JWT_AUDIENCE"),
      algorithms: ["HS256"],
      ignoreExpiration: false,
    });
  }

  async validate(untrustedPayload: unknown): Promise<AuthenticatedUser> {
    const parsed = accessTokenSchema.safeParse(untrustedPayload);

    if (!parsed.success) {
      throw new UnauthorizedException();
    }

    const payload: AccessTokenPayload = parsed.data;
    const session = await this.prisma.refreshToken.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (
      !session ||
      session.user.status !== UserStatus.ACTIVE ||
      session.createdAt < session.user.passwordChangedAt
    ) {
      throw new UnauthorizedException();
    }

    return {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role,
      emailVerified: session.user.emailVerifiedAt !== null,
      mfaEnabled: session.user.mfaEnabled,
    };
  }
}
