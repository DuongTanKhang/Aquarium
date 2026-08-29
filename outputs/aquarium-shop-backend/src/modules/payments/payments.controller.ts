import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/types/auth.types.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { Public } from "../auth/decorators/public.decorator.js";
import { UpdatePaymentSettingsDto } from "./dto/update-payment-settings.dto.js";
import { PaymentsService } from "./payments.service.js";
import { CreateOrderDto } from "../orders/dto/create-order.dto.js";

@ApiTags("admin-payments")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/payment-settings")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: "Get enabled payment methods for the US storefront" })
  getSettings() { return this.payments.getSettings(); }

  @Get("connections")
  @ApiOperation({ summary: "Get non-secret payment provider connection status" })
  getConnections() { return this.payments.getConnections(); }

  @Get("paypal/connect")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Create a one-time PayPal merchant onboarding URL" })
  startPayPalConnection(@CurrentUser() user: AuthenticatedUser) { return this.payments.startPayPalConnection(user.userId); }

  @Patch()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Update payment method toggles and default method" })
  updateSettings(@Body() dto: UpdatePaymentSettingsDto, @CurrentUser() user: AuthenticatedUser) { return this.payments.updateSettings(dto, user.userId); }

  @Public()
  @Roles()
  @Get("public")
  @ApiOperation({ summary: "Get enabled, non-sensitive payment methods for storefront checkout" })
  getPublicMethods() { return this.payments.getPublicMethods(); }
}

@ApiTags("payments")
@Controller("payments/paypal")
export class PayPalController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Roles()
  @Get("callback")
  @ApiOperation({ summary: "Receive the PayPal merchant onboarding callback" })
  async callback(@Query() query: { merchantId?: string; merchantIdInPayPal?: string; permissionsGranted?: string; consentStatus?: string; accountStatus?: string; isEmailConfirmed?: string }, @Res() response: Response) {
    const frontendUrl = new URL(this.payments.getFrontendUrl());
    frontendUrl.searchParams.set("view", "payments");
    try {
      const result = await this.payments.completePayPalConnection(query);
      frontendUrl.searchParams.set("paypal", result);
    } catch {
      frontendUrl.searchParams.set("paypal", "error");
    }
    return response.redirect(frontendUrl.toString());
  }

  @Post("orders")
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a server-priced PayPal checkout session" })
  createCheckout(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.payments.createPayPalCheckout(dto, user.userId, idempotencyKey);
  }

  @Post("orders/:id/resume")
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Resume a pending PayPal checkout for an existing order" })
  resumeCheckout(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.resumePayPalCheckout(id, user.userId);
  }

  @Post("orders/:id/capture")
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Capture an approved PayPal order and confirm the local order" })
  captureCheckout(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.capturePayPalCheckout(id, user.userId);
  }

  @Post("orders/:id/cancel")
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Release a cancelled PayPal checkout reservation" })
  cancelCheckout(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.cancelPayPalCheckout(id, user.userId);
  }

  @Post("webhook")
  @Public()
  @Roles()
  @ApiOperation({ summary: "Receive a PayPal webhook (signature verification required before processing)" })
  receiveWebhook(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: Record<string, unknown>) {
    return this.payments.receivePayPalWebhook(headers, body);
  }
}
