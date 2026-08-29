import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { AuthEventType, UserRole, UserStatus } from "../../generated/prisma/enums.js";
import { User } from "../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma.service.js";
import { UsersService } from "../users/users.service.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import { AccountRecoveryService } from "./account-recovery.service.js";
import { MfaService } from "./mfa.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";
import {
  AuthResult,
  ClientContext,
  MfaPendingResult,
  PublicUser,
} from "./types/auth.types.js";

const INVALID_CREDENTIALS_MESSAGE = "Thông tin đăng nhập không hợp lệ";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly recovery: AccountRecoveryService,
    private readonly mfa: MfaService,
  ) {}

  async register(
    dto: RegisterDto,
    context: ClientContext,
  ): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.users.findByEmail(email);

    if (existingUser) {
      throw new ConflictException("Email đã được sử dụng");
    }

    const passwordHash = await this.passwords.hash(dto.password);
    let user: User;

    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim(),
          role: "CUSTOMER",
        },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Email đã được sử dụng");
      }

      throw error;
    }

    await this.recordEvent(AuthEventType.REGISTERED, user.id, context);
    await this.recovery.sendEmailVerification(user.id, context);
    return this.issueSession(user, context);
  }

  async login(
    dto: LoginDto,
    context: ClientContext,
  ): Promise<AuthResult | MfaPendingResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    if (!user) {
      await this.passwords.verifyDummy(dto.password);
      await this.recordEvent(AuthEventType.LOGIN_FAILED, null, context);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      dto.password,
    );
    const now = new Date();

    if (user.lockedUntil && user.lockedUntil > now) {
      await this.recordEvent(AuthEventType.ACCOUNT_LOCKED, user.id, context);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (!passwordMatches || user.status !== UserStatus.ACTIVE) {
      await this.recordFailedLogin(user, context);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.mfaEnabled) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      return this.createMfaChallenge(user, context);
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      }),
      this.prisma.authEvent.create({
        data: {
          userId: user.id,
          type: AuthEventType.LOGIN_SUCCEEDED,
          ...this.contextData(context),
        },
      }),
    ]);

    return this.issueSession({ ...user, lastLoginAt: now }, context);
  }

  async verifyMfaLogin(
    mfaTicket: string,
    code: string,
    context: ClientContext,
  ): Promise<AuthResult> {
    let payload: { sub: string; cid: string };

    try {
      payload = await this.tokens.verifyMfaTicket(mfaTicket);
    } catch {
      throw new UnauthorizedException("MFA challenge không hợp lệ");
    }

    const challenge = await this.prisma.mfaChallenge.findUnique({
      where: { id: payload.cid },
      include: { user: true },
    });
    const now = new Date();

    if (
      !challenge ||
      challenge.userId !== payload.sub ||
      challenge.usedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= 5 ||
      !challenge.user.mfaEnabled ||
      challenge.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("MFA challenge không hợp lệ");
    }

    const verification = await this.mfa.verifyLoginCode(challenge.user, code);

    if (!verification.valid) {
      await this.prisma.$transaction([
        this.prisma.mfaChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts: { increment: 1 },
            usedAt: challenge.attempts >= 4 ? now : undefined,
          },
        }),
        this.prisma.authEvent.create({
          data: {
            userId: challenge.userId,
            type: AuthEventType.MFA_CHALLENGE_FAILED,
            ...this.contextData(context),
          },
        }),
      ]);
      throw new UnauthorizedException("Mã MFA không hợp lệ");
    }

    const accepted = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.mfaChallenge.updateMany({
        where: {
          id: challenge.id,
          userId: challenge.userId,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: 5 },
        },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) return false;

      if (verification.recoveryCodeId) {
        const recoveryCode = await transaction.mfaRecoveryCode.updateMany({
          where: {
            id: verification.recoveryCodeId,
            userId: challenge.userId,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        if (recoveryCode.count !== 1) return false;
      }

      if (verification.step !== undefined) {
        const totp = await transaction.user.updateMany({
          where: {
            id: challenge.userId,
            mfaEnabled: true,
            OR: [
              { mfaLastUsedStep: null },
              { mfaLastUsedStep: { lt: verification.step } },
            ],
          },
          data: { mfaLastUsedStep: verification.step },
        });
        if (totp.count !== 1) return false;
      }

      await transaction.user.update({
        where: { id: challenge.userId },
        data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
      });
      await transaction.authEvent.createMany({
        data: [
          {
            userId: challenge.userId,
            type: AuthEventType.MFA_CHALLENGE_SUCCEEDED,
            ...this.contextData(context),
          },
          {
            userId: challenge.userId,
            type: AuthEventType.LOGIN_SUCCEEDED,
            ...this.contextData(context),
          },
        ],
      });
      return true;
    });

    if (!accepted) {
      throw new UnauthorizedException("MFA challenge không hợp lệ");
    }

    return this.issueSession({ ...challenge.user, lastLoginAt: now }, context);
  }

  async refresh(
    rawRefreshToken: string | undefined,
    context: ClientContext,
  ): Promise<AuthResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ");
    }

    const tokenHash = this.tokens.hashRefreshToken(rawRefreshToken);
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!current) {
      await this.recordEvent(AuthEventType.TOKEN_REFRESH_FAILED, null, context);
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ");
    }

    const now = new Date();

    if (current.revokedAt) {
      await this.revokeTokenFamily(
        current.familyId,
        "REUSE_DETECTED",
        current.userId,
        context,
      );
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ");
    }

    if (current.expiresAt <= now || current.user.status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: {
          revokedAt: now,
          revokedReason: current.expiresAt <= now ? "EXPIRED" : "USER_INACTIVE",
        },
      });
      await this.recordEvent(
        AuthEventType.TOKEN_REFRESH_FAILED,
        current.userId,
        context,
      );
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ");
    }

    const next = this.tokens.createRefreshToken();
    const nextSessionId = randomUUID();
    const contextData = this.contextData(context);

    const rotated = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.refreshToken.updateMany({
        where: {
          id: current.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          revokedReason: "ROTATED",
          lastUsedAt: now,
        },
      });

      if (claimed.count !== 1) {
        await transaction.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now, revokedReason: "REUSE_DETECTED" },
        });
        await transaction.authEvent.create({
          data: {
            userId: current.userId,
            type: AuthEventType.TOKEN_REUSE_DETECTED,
            ...contextData,
          },
        });
        return false;
      }

      await transaction.refreshToken.create({
        data: {
          id: nextSessionId,
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
          ...contextData,
        },
      });
      await transaction.authEvent.create({
        data: {
          userId: current.userId,
          type: AuthEventType.TOKEN_REFRESHED,
          ...contextData,
        },
      });

      return true;
    });

    if (!rotated) {
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ");
    }

    return {
      accessToken: await this.tokens.signAccessToken(
        current.user,
        nextSessionId,
      ),
      accessTokenExpiresIn: this.tokens.accessTokenTtlSeconds,
      refreshToken: next.rawToken,
      refreshTokenExpiresAt: next.expiresAt,
      user: this.users.toPublicUser(current.user),
    };
  }

  async logout(
    rawRefreshToken: string | undefined,
    context: ClientContext,
  ): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = this.tokens.hashRefreshToken(rawRefreshToken);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });

    if (!token) {
      return;
    }

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
    });

    if (revoked.count === 1) {
      await this.recordEvent(AuthEventType.LOGGED_OUT, token.userId, context);
    }
  }

  async logoutAll(userId: string, context: ClientContext): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "LOGOUT_ALL" },
      }),
      this.prisma.authEvent.create({
        data: {
          userId,
          type: AuthEventType.LOGGED_OUT_ALL,
          ...this.contextData(context),
        },
      }),
    ]);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    context: ClientContext,
  ): Promise<AuthResult> {
    const user = await this.users.findById(userId);

    if (!user || user.role !== UserRole.CUSTOMER || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    const currentPasswordMatches = await this.passwords.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException("Mật khẩu hiện tại không đúng");
    }

    if (await this.passwords.verify(user.passwordHash, dto.newPassword)) {
      throw new BadRequestException("Mật khẩu mới phải khác mật khẩu hiện tại");
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    const now = new Date();

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "PASSWORD_CHANGED" },
      });
      await transaction.authEvent.create({
        data: {
          userId,
          type: AuthEventType.PASSWORD_CHANGED,
          ...this.contextData(context),
        },
      });

      return updated;
    });

    return this.issueSession(updatedUser, context);
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    return this.users.toPublicUser(user);
  }

  async issueVerifiedEmailSession(
    userId: string,
    context: ClientContext,
  ): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user || user.role !== UserRole.CUSTOMER || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Account is not active");
    }
    return this.issueSession(user, context);
  }

  private async issueSession(
    user: User,
    context: ClientContext,
  ): Promise<AuthResult> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refreshToken = this.tokens.createRefreshToken();
    const accessToken = await this.tokens.signAccessToken(user, sessionId);

    await this.prisma.refreshToken.create({
      data: {
        id: sessionId,
        userId: user.id,
        familyId,
        tokenHash: refreshToken.tokenHash,
        expiresAt: refreshToken.expiresAt,
        ...this.contextData(context),
      },
    });

    return {
      accessToken,
      accessTokenExpiresIn: this.tokens.accessTokenTtlSeconds,
      refreshToken: refreshToken.rawToken,
      refreshTokenExpiresAt: refreshToken.expiresAt,
      user: this.users.toPublicUser(user),
    };
  }

  private async createMfaChallenge(
    user: User,
    context: ClientContext,
  ): Promise<MfaPendingResult> {
    const id = randomUUID();
    const expiresAt = new Date(
      Date.now() + this.tokens.mfaChallengeTtlSeconds * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.mfaChallenge.create({
        data: {
          id,
          userId: user.id,
          expiresAt,
          ...this.contextData(context),
        },
      }),
      this.prisma.authEvent.create({
        data: {
          userId: user.id,
          type: AuthEventType.MFA_CHALLENGE_CREATED,
          ...this.contextData(context),
        },
      }),
    ]);

    return {
      mfaRequired: true,
      mfaTicket: await this.tokens.signMfaTicket(user.id, id),
      expiresIn: this.tokens.mfaChallengeTtlSeconds,
    };
  }

  private async recordFailedLogin(
    user: User,
    context: ClientContext,
  ): Promise<void> {
    const now = new Date();
    const maxAttempts = this.config.getOrThrow<number>(
      "AUTH_MAX_FAILED_LOGINS",
    );
    const priorAttempts =
      user.lockedUntil && user.lockedUntil <= now
        ? 0
        : user.failedLoginAttempts;
    const failedLoginAttempts = priorAttempts + 1;
    const shouldLock = failedLoginAttempts >= maxAttempts;
    const lockMinutes = this.config.getOrThrow<number>("AUTH_LOCK_MINUTES");
    const lockedUntil = shouldLock
      ? new Date(now.getTime() + lockMinutes * 60_000)
      : null;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts, lockedUntil },
      }),
      this.prisma.authEvent.create({
        data: {
          userId: user.id,
          type: shouldLock
            ? AuthEventType.ACCOUNT_LOCKED
            : AuthEventType.LOGIN_FAILED,
          ...this.contextData(context),
        },
      }),
    ]);
  }

  private async revokeTokenFamily(
    familyId: string,
    reason: string,
    userId: string,
    context: ClientContext,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
      this.prisma.authEvent.create({
        data: {
          userId,
          type: AuthEventType.TOKEN_REUSE_DETECTED,
          ...this.contextData(context),
        },
      }),
    ]);
  }

  private recordEvent(
    type: AuthEventType,
    userId: string | null,
    context: ClientContext,
  ): Promise<unknown> {
    return this.prisma.authEvent.create({
      data: {
        userId,
        type,
        ...this.contextData(context),
      },
    });
  }

  private contextData(context: ClientContext): {
    ipAddress?: string;
    userAgent?: string;
  } {
    return {
      ipAddress: context.ipAddress?.slice(0, 64),
      userAgent: context.userAgent?.slice(0, 512),
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}
