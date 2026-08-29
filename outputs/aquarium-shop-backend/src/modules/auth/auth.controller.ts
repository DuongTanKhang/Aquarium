import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "../../generated/prisma/enums.js";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { CookieOptions, Request, Response } from "express";
import { AccountRecoveryService } from "./account-recovery.service.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import { Public } from "./decorators/public.decorator.js";
import { Roles } from "./decorators/roles.decorator.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import {
  EmailRequestDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto/email-token.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { DisableMfaDto, MfaCodeDto, MfaLoginDto } from "./dto/mfa.dto.js";
import { VerifyPhoneDto } from "./dto/phone-token.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import { MfaService } from "./mfa.service.js";
import type {
  AuthResult,
  AuthenticatedUser,
  ClientContext,
  MfaPendingResult,
  PublicUser,
} from "./types/auth.types.js";

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

type AuthResponse = Omit<AuthResult, "refreshToken" | "refreshTokenExpiresAt">;
type LoginResponse = AuthResponse | MfaPendingResult;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly recovery: AccountRecoveryService,
    private readonly mfa: MfaService,
  ) {}

  @Public()
  @Post("register")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: "Register a customer account" })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.register(dto, this.context(request));
    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Sign in and create a refresh-token session" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(dto, this.context(request));

    if ("mfaRequired" in result) {
      return result;
    }

    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Public()
  @Post("mfa/verify-login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Complete an MFA-protected login" })
  async verifyMfaLogin(
    @Body() dto: MfaLoginDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.verifyMfaLogin(
      dto.mfaTicket,
      dto.code,
      this.context(request),
    );
    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiCookieAuth("refresh-cookie")
  @ApiOperation({
    summary: "Rotate the refresh token and issue a new access token",
  })
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.refresh(
      request.cookies[this.cookieName],
      this.context(request),
    );
    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth("refresh-cookie")
  @ApiOperation({ summary: "Revoke the current refresh-token session" })
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(
      request.cookies[this.cookieName],
      this.context(request),
    );
    response.clearCookie(this.cookieName, this.baseCookieOptions());
    response.setHeader("Clear-Site-Data", '"cache"');
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Revoke every active session for the current user" })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.userId, this.context(request));
    response.clearCookie(this.cookieName, this.baseCookieOptions());
    response.setHeader("Clear-Site-Data", '"cache"');
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Change password, revoke all sessions, and sign in again",
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.changePassword(
      user.userId,
      dto,
      this.context(request),
    );
    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current authenticated user" })
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.getMe(user.userId);
  }

  @Post("email/send-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Send a new single-use email verification link" })
  async sendEmailVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: CookieRequest,
  ): Promise<{ message: string }> {
    await this.recovery.sendEmailVerification(
      user.userId,
      this.context(request),
    );
    return {
      message: this.config.get<string>("MAIL_MODE", "console") === "console"
        ? "Development mode: the verification link was written to the API console"
        : "If needed, a verification email has been sent",
    };
  }

  @Public()
  @Post("email/verify")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Consume a single-use email verification token" })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const userId = await this.recovery.verifyEmail(dto.token, this.context(request));
    const result = await this.authService.issueVerifiedEmailSession(userId, this.context(request));
    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Roles(UserRole.CUSTOMER)
  @Post("phone/send-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Send a single-use US phone verification code" })
  async sendPhoneVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: CookieRequest,
  ): Promise<{ message: string }> {
    await this.recovery.sendPhoneVerification(user.userId, this.context(request));
    return {
      message: this.config.get<string>("SMS_MODE", "console") === "console"
        ? "Development mode: the verification code was written to the API console"
        : "If needed, a verification code has been sent",
    };
  }

  @Roles(UserRole.CUSTOMER)
  @Post("phone/verify")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Verify a US phone with the latest SMS code" })
  async verifyPhone(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPhoneDto,
    @Req() request: CookieRequest,
  ): Promise<PublicUser> {
    await this.recovery.verifyPhone(user.userId, dto.code, this.context(request));
    return this.authService.getMe(user.userId);
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiOperation({
    summary: "Request a password reset without revealing account existence",
  })
  async forgotPassword(
    @Body() dto: EmailRequestDto,
    @Req() request: CookieRequest,
  ): Promise<{ message: string }> {
    await this.recovery.forgotPassword(dto.email, this.context(request));
    return {
      message: "Nếu tài khoản tồn tại, email đặt lại mật khẩu đã được gửi",
    };
  }

  @Public()
  @Post("password/reset")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary: "Consume a reset token and revoke all previous sessions",
  })
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: CookieRequest,
  ): Promise<void> {
    return this.recovery.resetPassword(
      dto.token,
      dto.newPassword,
      this.context(request),
    );
  }

  @Post("mfa/setup")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a pending TOTP secret" })
  setupMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: CookieRequest,
  ): Promise<{ manualKey: string; otpauthUri: string }> {
    return this.mfa.setup(user.userId, this.context(request));
  }

  @Post("mfa/enable")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Verify TOTP setup and return one-time recovery codes",
  })
  async enableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ recoveryCodes: string[] }> {
    const result = await this.mfa.enable(
      user.userId,
      dto.code,
      this.context(request),
    );
    response.clearCookie(this.cookieName, this.baseCookieOptions());
    return result;
  }

  @Post("mfa/recovery-codes")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Replace all MFA recovery codes" })
  regenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
    @Req() request: CookieRequest,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.mfa.regenerateRecoveryCodes(
      user.userId,
      dto.code,
      this.context(request),
    );
  }

  @Post("mfa/disable")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Disable MFA after password and MFA verification" })
  async disableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableMfaDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.mfa.disable(
      user.userId,
      dto.password,
      dto.code,
      this.context(request),
    );
    response.clearCookie(this.cookieName, this.baseCookieOptions());
  }

  private setRefreshCookie(response: Response, result: AuthResult): void {
    response.cookie(this.cookieName, result.refreshToken, {
      ...this.baseCookieOptions(),
      expires: result.refreshTokenExpiresAt,
      maxAge: Math.max(result.refreshTokenExpiresAt.getTime() - Date.now(), 0),
    });
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      priority: "high",
    };
  }

  private context(request: Request): ClientContext {
    return {
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
    };
  }

  private toResponse(result: AuthResult): AuthResponse {
    return {
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      user: result.user,
    };
  }

  private get cookieName(): string {
    return this.config.getOrThrow<string>("AUTH_COOKIE_NAME");
  }
}
