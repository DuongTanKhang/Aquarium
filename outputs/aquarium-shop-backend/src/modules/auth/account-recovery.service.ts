import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { AuthEventType, EmailTokenType } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";
import { UsersService } from "../users/users.service.js";
import { EmailService } from "./email.service.js";
import { PasswordService } from "./password.service.js";
import { SmsService } from "./sms.service.js";
import type { ClientContext } from "./types/auth.types.js";

@Injectable()
export class AccountRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  async sendEmailVerification(
    userId: string,
    context: ClientContext,
  ): Promise<void> {
    const user = await this.users.findById(userId);

    if (!user || user.emailVerifiedAt) {
      return;
    }

    const token = await this.issueToken(
      user.id,
      EmailTokenType.VERIFY_EMAIL,
      this.config.getOrThrow<number>("EMAIL_VERIFY_TTL_SECONDS"),
    );
    await this.email.sendVerificationEmail(user.email, user.fullName, token);
    await this.recordEvent(
      AuthEventType.EMAIL_VERIFICATION_SENT,
      user.id,
      context,
    );
  }

  async verifyEmail(rawToken: string, context: ClientContext): Promise<string> {
    const tokenHash = this.hashToken(rawToken);
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash },
    });
    const now = new Date();

    if (
      !token ||
      token.type !== EmailTokenType.VERIFY_EMAIL ||
      token.consumedAt ||
      token.expiresAt <= now
    ) {
      throw new UnauthorizedException(
        "Token xác minh không hợp lệ hoặc đã hết hạn",
      );
    }

    const consumed = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.emailToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await transaction.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
      });
      await transaction.authEvent.create({
        data: {
          userId: token.userId,
          type: AuthEventType.EMAIL_VERIFIED,
          ...this.contextData(context),
        },
      });
      return true;
    });

    if (!consumed) {
      throw new UnauthorizedException(
        "Token xác minh không hợp lệ hoặc đã hết hạn",
      );
    }

    return token.userId;
  }

  async sendPhoneVerification(userId: string, context: ClientContext): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || !user.phone) throw new BadRequestException("A US phone number is required before verification");
    if (!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(user.phone)) {
      throw new BadRequestException("Update your profile with a valid US phone number before verification");
    }
    if (user.phoneVerifiedAt) return;
    const code = await this.issueToken(
      user.id,
      EmailTokenType.VERIFY_PHONE,
      this.config.getOrThrow<number>("PHONE_VERIFY_TTL_SECONDS"),
      () => randomInt(100000, 1000000).toString(),
    );
    await this.sms.sendPhoneVerification(user.phone, code);
    await this.recordEvent(AuthEventType.PHONE_VERIFICATION_SENT, user.id, context);
  }

  async verifyPhone(userId: string, code: string, context: ClientContext): Promise<void> {
    const now = new Date();
    const token = await this.prisma.emailToken.findFirst({
      where: { userId, type: EmailTokenType.VERIFY_PHONE, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!token || this.hashToken(code) !== token.tokenHash) {
      throw new UnauthorizedException("Phone verification code is invalid or expired");
    }
    const consumed = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.emailToken.updateMany({ where: { id: token.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) return false;
      await transaction.user.update({ where: { id: userId }, data: { phoneVerifiedAt: now } });
      await transaction.authEvent.create({ data: { userId, type: AuthEventType.PHONE_VERIFIED, ...this.contextData(context) } });
      return true;
    });
    if (!consumed) throw new UnauthorizedException("Phone verification code is invalid or expired");
  }

  async forgotPassword(email: string, context: ClientContext): Promise<void> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());

    if (!user) {
      await this.passwords.verifyDummy(randomBytes(16).toString("hex"));
      return;
    }

    const token = await this.issueToken(
      user.id,
      EmailTokenType.PASSWORD_RESET,
      this.config.getOrThrow<number>("PASSWORD_RESET_TTL_SECONDS"),
      () => randomInt(100000, 1000000).toString(),
    );
    await this.email.sendPasswordResetEmail(user.email, user.fullName, token);
    await this.recordEvent(
      AuthEventType.PASSWORD_RESET_REQUESTED,
      user.id,
      context,
    );
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
    context: ClientContext,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash },
    });
    const now = new Date();

    if (
      !token ||
      token.type !== EmailTokenType.PASSWORD_RESET ||
      token.consumedAt ||
      token.expiresAt <= now
    ) {
      throw new UnauthorizedException(
        "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
      );
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const reset = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.emailToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await transaction.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          emailVerifiedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.emailToken.updateMany({
        where: {
          userId: token.userId,
          type: EmailTokenType.PASSWORD_RESET,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "PASSWORD_RESET" },
      });
      await transaction.authEvent.create({
        data: {
          userId: token.userId,
          type: AuthEventType.PASSWORD_RESET_COMPLETED,
          ...this.contextData(context),
        },
      });
      return true;
    });

    if (!reset) {
      throw new UnauthorizedException(
        "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
      );
    }
  }

  private async issueToken(
    userId: string,
    type: EmailTokenType,
    ttlSeconds: number,
    createRawToken: () => string = () => randomBytes(48).toString("base64url"),
  ): Promise<string> {
    const rawToken = createRawToken();
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          type,
          tokenHash: this.hashToken(rawToken),
          expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
        },
      }),
    ]);

    return rawToken;
  }

  private hashToken(rawToken: string): string {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("ONE_TIME_TOKEN_PEPPER"),
    )
      .update(rawToken, "utf8")
      .digest("hex");
  }

  private recordEvent(
    type: AuthEventType,
    userId: string,
    context: ClientContext,
  ): Promise<unknown> {
    return this.prisma.authEvent.create({
      data: { userId, type, ...this.contextData(context) },
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
}
