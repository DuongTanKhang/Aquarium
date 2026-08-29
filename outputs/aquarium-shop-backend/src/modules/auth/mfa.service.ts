import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { User } from "../../generated/prisma/client.js";
import { AuthEventType } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";
import { UsersService } from "../users/users.service.js";
import { PasswordService } from "./password.service.js";
import type { ClientContext } from "./types/auth.types.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;

export interface MfaVerification {
  valid: boolean;
  step?: number;
  recoveryCodeId?: string;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
  ) {}

  async setup(
    userId: string,
    context: ClientContext,
  ): Promise<{ manualKey: string; otpauthUri: string }> {
    const user = await this.users.findById(userId);

    if (!user || user.mfaEnabled) {
      throw new BadRequestException(
        "MFA đã được bật hoặc tài khoản không hợp lệ",
      );
    }

    const secret = this.base32Encode(randomBytes(20));
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaPendingEncrypted: this.encrypt(secret) },
      }),
      this.prisma.authEvent.create({
        data: {
          userId,
          type: AuthEventType.MFA_SETUP_STARTED,
          ...this.contextData(context),
        },
      }),
    ]);

    const label = encodeURIComponent(`Aquarium Shop:${user.email}`);
    const issuer = encodeURIComponent("Aquarium Shop");

    return {
      manualKey: secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_SECONDS}`,
    };
  }

  async enable(
    userId: string,
    code: string,
    context: ClientContext,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.users.findById(userId);

    if (!user?.mfaPendingEncrypted || user.mfaEnabled) {
      throw new BadRequestException("Chưa có thiết lập MFA đang chờ xác nhận");
    }

    const secret = this.decrypt(user.mfaPendingEncrypted);
    const matchedStep = this.matchTotp(secret, code, null);

    if (matchedStep === null) {
      throw new UnauthorizedException("Mã MFA không hợp lệ");
    }

    const recoveryCodes = this.generateRecoveryCodes();
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecretEncrypted: this.encrypt(secret),
          mfaPendingEncrypted: null,
          mfaVerifiedAt: now,
          mfaLastUsedStep: matchedStep,
        },
      });
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId } });
      await transaction.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId,
          codeHash: this.hashRecoveryCode(recoveryCode),
        })),
      });
      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "MFA_ENABLED" },
      });
      await transaction.authEvent.create({
        data: {
          userId,
          type: AuthEventType.MFA_ENABLED,
          ...this.contextData(context),
        },
      });
    });

    return { recoveryCodes };
  }

  async disable(
    userId: string,
    password: string,
    code: string,
    context: ClientContext,
  ): Promise<void> {
    const user = await this.users.findById(userId);

    if (
      !user?.mfaEnabled ||
      !(await this.passwords.verify(user.passwordHash, password))
    ) {
      throw new UnauthorizedException("Không thể tắt MFA");
    }

    const verification = await this.verifyLoginCode(user, code);

    if (!verification.valid) {
      throw new UnauthorizedException("Không thể tắt MFA");
    }

    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      if (verification.recoveryCodeId) {
        await transaction.mfaRecoveryCode.update({
          where: { id: verification.recoveryCodeId },
          data: { consumedAt: now },
        });
      }
      await transaction.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          mfaPendingEncrypted: null,
          mfaVerifiedAt: null,
          mfaLastUsedStep: null,
        },
      });
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId } });
      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "MFA_DISABLED" },
      });
      await transaction.authEvent.create({
        data: {
          userId,
          type: AuthEventType.MFA_DISABLED,
          ...this.contextData(context),
        },
      });
    });
  }

  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    context: ClientContext,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.users.findById(userId);

    if (!user?.mfaEnabled) {
      throw new BadRequestException("MFA chưa được bật");
    }

    const verification = await this.verifyLoginCode(user, code);

    if (!verification.valid) {
      throw new UnauthorizedException("Mã MFA không hợp lệ");
    }

    const recoveryCodes = this.generateRecoveryCodes();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId } });
      await transaction.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId,
          codeHash: this.hashRecoveryCode(recoveryCode),
        })),
      });
      if (verification.step !== undefined) {
        await transaction.user.update({
          where: { id: userId },
          data: { mfaLastUsedStep: verification.step },
        });
      }
      await transaction.authEvent.create({
        data: {
          userId,
          type: AuthEventType.MFA_RECOVERY_CODES_REGENERATED,
          ...this.contextData(context),
        },
      });
    });

    return { recoveryCodes };
  }

  async verifyLoginCode(user: User, code: string): Promise<MfaVerification> {
    const normalizedCode = code.replace(/[\s-]/g, "").toUpperCase();

    if (/^\d{6}$/.test(normalizedCode) && user.mfaSecretEncrypted) {
      const step = this.matchTotp(
        this.decrypt(user.mfaSecretEncrypted),
        normalizedCode,
        user.mfaLastUsedStep,
      );
      return step === null ? { valid: false } : { valid: true, step };
    }

    const recoveryCode = await this.prisma.mfaRecoveryCode.findFirst({
      where: {
        userId: user.id,
        codeHash: this.hashRecoveryCode(normalizedCode),
        consumedAt: null,
      },
      select: { id: true },
    });

    return recoveryCode
      ? { valid: true, recoveryCodeId: recoveryCode.id }
      : { valid: false };
  }

  private matchTotp(
    secret: string,
    code: string,
    lastUsedStep: number | null,
  ): number | null {
    const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);

    for (const offset of [-1, 0, 1]) {
      const step = currentStep + offset;

      if (lastUsedStep !== null && step <= lastUsedStep) {
        continue;
      }

      const expected = Buffer.from(this.totp(secret, step));
      const received = Buffer.from(code);

      if (
        expected.length === received.length &&
        timingSafeEqual(expected, received)
      ) {
        return step;
      }
    }

    return null;
  }

  private totp(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac("sha1", this.base32Decode(secret))
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

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((value) => value.toString("base64url"))
      .join(".");
  }

  private decrypt(encrypted: string): string {
    const [iv, tag, ciphertext] = encrypted
      .split(".")
      .map((value) => Buffer.from(value, "base64url"));

    if (!iv || !tag || !ciphertext) {
      throw new Error("Invalid encrypted MFA secret");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }

  private base32Encode(input: Buffer): string {
    let bits = "";
    let output = "";

    for (const byte of input) {
      bits += byte.toString(2).padStart(8, "0");
    }
    for (let index = 0; index < bits.length; index += 5) {
      output +=
        BASE32_ALPHABET[
          parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)
        ];
    }
    return output;
  }

  private base32Decode(input: string): Buffer {
    let bits = "";

    for (const character of input.replace(/=+$/, "")) {
      const value = BASE32_ALPHABET.indexOf(character.toUpperCase());
      if (value < 0) throw new Error("Invalid base32 value");
      bits += value.toString(2).padStart(5, "0");
    }

    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: 10 }, () => {
      const compact = randomBytes(8).toString("hex").toUpperCase();
      return compact.match(/.{1,4}/g)?.join("-") ?? compact;
    });
  }

  private hashRecoveryCode(code: string): string {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("ONE_TIME_TOKEN_PEPPER"),
    )
      .update(code.replace(/[\s-]/g, "").toUpperCase(), "utf8")
      .digest("hex");
  }

  private get encryptionKey(): Buffer {
    return Buffer.from(
      this.config.getOrThrow<string>("MFA_ENCRYPTION_KEY_BASE64"),
      "base64",
    );
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
