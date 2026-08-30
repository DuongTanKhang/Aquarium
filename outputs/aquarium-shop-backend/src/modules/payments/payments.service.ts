import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma.service.js";
import { OrderStatus } from "../../generated/prisma/enums.js";
import { OrdersService, type OrderResponse } from "../orders/orders.service.js";
import { CreateOrderDto } from "../orders/dto/create-order.dto.js";
import { PAYMENT_METHOD_IDS, type PaymentMethodId, type UpdatePaymentSettingsDto } from "./dto/update-payment-settings.dto.js";

export interface PaymentMethodConfig {
  id: PaymentMethodId;
  provider: "CARD" | "PAYPAL" | "COD";
  label: string;
  description: string;
  enabled: boolean;
  setupNote: string;
}

export interface PaymentSettingsResponse {
  country: "US";
  currency: "USD";
  defaultMethod: PaymentMethodId;
  methods: PaymentMethodConfig[];
  updatedAt: Date;
}

export interface PaymentConnectionsResponse {
  paypal: { configured: boolean; connected: boolean; merchantId: string | null; setupUrl: string; mode: "direct" | "connect" };
}

export interface PayPalConnectionStartResponse {
  url: string;
  expiresIn: number;
}

export interface PayPalCheckoutStartResponse {
  order: OrderResponse;
  paypalOrderId: string;
  approvalUrl: string;
  expiresIn: number;
}

export interface PayPalCheckoutCaptureResponse {
  order: OrderResponse;
  captureId: string | null;
  status: "COMPLETED" | "PENDING";
}

export interface PayPalRefundResponse {
  refundId: string;
  status: string;
}

interface StoredProviderConnections {
  paypalPending?: {
    trackingId: string;
    expiresAt: number;
    userId: string;
  };
  paypal?: {
    merchantId: string;
    trackingId: string;
    permissionsGranted: boolean;
    consentStatus: boolean;
    accountStatus: string | null;
    verifiedAt: string | null;
    connectedAt: string;
    updatedBy: string;
  };
}

interface PayPalPaymentPayload {
  paypalOrderId?: string;
  approvalUrl?: string;
  amount?: string;
  currencyCode?: string;
  captureId?: string;
  status?: string;
  createdAt?: string;
  capturedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DEFAULT_METHODS: PaymentMethodConfig[] = [
  // Card checkout is intentionally off until a PCI-compliant hosted card
  // processor is integrated. The API must never accept raw PAN/CVV data.
  { id: "CARD", provider: "CARD", label: "Credit & debit cards", description: "Secure card checkout will be available after a hosted card processor is configured.", enabled: false, setupNote: "Not available until a PCI-compliant hosted checkout is configured; never enter card details here." },
  { id: "PAYPAL", provider: "PAYPAL", label: "PayPal", description: "PayPal checkout with cards, Pay Later and eligible funding sources.", enabled: true, setupNote: "Requires PayPal client ID and secret in the server environment." },
  { id: "COD", provider: "COD", label: "Cash on delivery", description: "Pay in cash when your order arrives. No online payment is required at checkout.", enabled: true, setupNote: "The order is confirmed now and marked unpaid until delivery is collected." },
];

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly orders: OrdersService) {}

  async getConnections(): Promise<PaymentConnectionsResponse> {
    const paypalClientId = this.config.get<string | undefined>("PAYPAL_CLIENT_ID");
    const paypalSecret = this.config.get<string | undefined>("PAYPAL_CLIENT_SECRET");
    const paypalMode = this.config.get<"direct" | "connect">("PAYPAL_INTEGRATION_MODE", "direct");
    const paypalPartnerMerchantId = this.config.get<string | undefined>("PAYPAL_PARTNER_MERCHANT_ID");
    const paypalReturnUrl = this.config.get<string | undefined>("PAYPAL_RETURN_URL");
    const storedConnections = await this.getStoredProviderConnections();
    const storedPayPal = storedConnections.paypal;
    const paypalMerchantId = storedPayPal?.merchantId ?? this.config.get<string | undefined>("PAYPAL_MERCHANT_ID") ?? null;
    return {
      paypal: {
        // Direct mode only needs the shop's own REST app. Connect mode also
        // needs partner approval, partner merchant ID and a registered callback.
        configured: paypalMode === "direct" ? Boolean(paypalClientId && paypalSecret) : Boolean(paypalClientId && paypalSecret && paypalPartnerMerchantId && paypalReturnUrl),
        connected: Boolean(paypalClientId && paypalSecret && paypalMerchantId && (storedPayPal ? storedPayPal.verifiedAt : true)),
        merchantId: paypalMerchantId,
        setupUrl: this.config.get<string>("PAYPAL_SETUP_URL", "https://developer.paypal.com/dashboard/applications/live"),
        mode: paypalMode,
      },
    };
  }

  async startPayPalConnection(userId: string): Promise<PayPalConnectionStartResponse> {
    const clientId = this.config.get<string | undefined>("PAYPAL_CLIENT_ID");
    const clientSecret = this.config.get<string | undefined>("PAYPAL_CLIENT_SECRET");
    const returnUrl = this.config.get<string | undefined>("PAYPAL_RETURN_URL");
    const partnerMerchantId = this.config.get<string | undefined>("PAYPAL_PARTNER_MERCHANT_ID");
    const paypalMode = this.config.get<"direct" | "connect">("PAYPAL_INTEGRATION_MODE", "direct");
    if (paypalMode === "direct") {
      throw new BadRequestException("PayPal đang ở direct mode cho shop một admin. Không cần PayPal Connect; hãy cấu hình PAYPAL_CLIENT_ID và PAYPAL_CLIENT_SECRET trên server rồi dùng Manage để mở PayPal Developer.");
    }
    if (!clientId || !clientSecret || !partnerMerchantId || !returnUrl) {
      throw new ServiceUnavailableException("PayPal Connect chưa được cấu hình. Cần PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_PARTNER_MERCHANT_ID và PAYPAL_RETURN_URL trên server");
    }
    let parsedReturnUrl: URL;
    try { parsedReturnUrl = new URL(returnUrl); } catch { throw new ServiceUnavailableException("PAYPAL_RETURN_URL không hợp lệ"); }
    const nodeEnv = this.config.get<string>("NODE_ENV", "development");
    if (!["https:", "http:"].includes(parsedReturnUrl.protocol) || (nodeEnv === "production" && parsedReturnUrl.protocol !== "https:") || parsedReturnUrl.hash || parsedReturnUrl.toString().length > 127) {
      throw new ServiceUnavailableException("PAYPAL_RETURN_URL phải là URL HTTP(S) không có fragment");
    }
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    // PayPal limits tracking_id to 127 characters. Keep the signed state
    // compact while still binding it to the admin and a short-lived nonce.
    const payload = `${Buffer.from(userId).toString("base64url")}.${expiresAt}.${randomBytes(8).toString("base64url")}`;
    const signature = this.signPayPalState(payload);
    const trackingId = `${payload}.${signature}`;
    const apiBase = this.payPalApiBase();
    const accessToken = await this.getPayPalAccessToken(apiBase, clientId, clientSecret);
    const referralPayload = {
      tracking_id: trackingId,
      operations: [{ operation: "API_INTEGRATION", api_integration_preference: { rest_api_integration: { integration_method: "PAYPAL", integration_type: "THIRD_PARTY", third_party_details: { features: ["PAYMENT", "REFUND"] } } } }],
      products: ["PPCP"],
      legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
      partner_config_override: {
        return_url: parsedReturnUrl.toString(),
        return_url_description: "Return to Aquarium Shop after secure PayPal consent.",
        ...(this.config.get<string | undefined>("PAYPAL_PARTNER_LOGO_URL") ? { partner_logo_url: this.config.get<string>("PAYPAL_PARTNER_LOGO_URL") } : {}),
      },
    };
    const response = await this.fetchWithTimeout(`${apiBase}/v2/customer/partner-referrals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(this.config.get<string | undefined>("PAYPAL_PARTNER_ATTRIBUTION_ID") ? { "PayPal-Partner-Attribution-Id": this.config.get<string>("PAYPAL_PARTNER_ATTRIBUTION_ID") } : {}),
      },
      body: JSON.stringify(referralPayload),
    });
    if (!response.ok) throw new ServiceUnavailableException("PayPal không tạo được phiên liên kết. Kiểm tra partner approval và credentials");
    const data = await this.readJson(response);
    const actionUrl = Array.isArray(data?.links) ? data.links.find((link: unknown) => typeof link === "object" && link !== null && (link as { rel?: string }).rel === "action_url") as { href?: string } | undefined : undefined;
    if (!actionUrl?.href || !/^https:\/\/([a-z0-9-]+\.)?paypal\.com\//i.test(actionUrl.href)) throw new ServiceUnavailableException("PayPal trả về onboarding URL không hợp lệ");
    const current = await this.getSettings();
    const previous = await this.getStoredProviderConnections();
    const pending: StoredProviderConnections = { ...previous, paypalPending: { trackingId, expiresAt, userId } };
    await this.saveProviderConnections(pending, userId, current);
    return { url: actionUrl.href, expiresIn: 600 };
  }

  async completePayPalConnection(query: { merchantId?: string; merchantIdInPayPal?: string; permissionsGranted?: string; consentStatus?: string; accountStatus?: string; isEmailConfirmed?: string }): Promise<"connected" | "incomplete"> {
    const trackingId = query.merchantId;
    const merchantId = query.merchantIdInPayPal;
    if (!trackingId || !merchantId) throw new BadRequestException("PayPal callback thiếu merchant identifier");
    const payload = this.verifyPayPalState(trackingId);
    const permissionsGranted = query.permissionsGranted === "true";
    const consentStatus = query.consentStatus === "true";
    const complete = permissionsGranted && consentStatus;
    const previous = await this.getStoredProviderConnections();
    if (!previous.paypalPending || previous.paypalPending.trackingId !== trackingId || previous.paypalPending.userId !== payload.userId || previous.paypalPending.expiresAt < Math.floor(Date.now() / 1000)) throw new BadRequestException("PayPal callback không còn là phiên liên kết đang chờ");
    const admin = await this.prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true, status: true } });
    if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") throw new BadRequestException("Tài khoản admin không còn hoạt động");
    let verifiedAt: string | null = null;
    if (complete) {
      await this.verifyPayPalMerchant(merchantId);
      verifiedAt = new Date().toISOString();
    }
    const current = await this.getSettings();
    const withoutPending = { ...previous };
    delete withoutPending.paypalPending;
    const next: StoredProviderConnections = {
      ...withoutPending,
      paypal: {
        merchantId,
        trackingId,
        permissionsGranted,
        consentStatus,
        accountStatus: query.accountStatus ?? null,
        verifiedAt,
        connectedAt: new Date().toISOString(),
        updatedBy: payload.userId,
      },
    };
    await this.saveProviderConnections(next, payload.userId, current);
    return complete ? "connected" : "incomplete";
  }

  getFrontendUrl(): string {
    return this.config.getOrThrow<string>("FRONTEND_URL");
  }

  /**
   * Create a local order and a PayPal order. The browser never supplies an
   * amount: OrdersService calculates it from current catalog prices first.
   */
  async createPayPalCheckout(dto: CreateOrderDto, customerId: string, idempotencyKey?: string): Promise<PayPalCheckoutStartResponse> {
    const configured = this.getPayPalCheckoutConfig();
    const order = await this.orders.createPublic({ ...dto, paymentMethod: "PAYPAL" }, customerId, idempotencyKey);
    const existingPayment = await this.prisma.payment.findUnique({ where: { orderId: order.id }, select: { status: true, providerOrderId: true, providerPayload: true } });
    const existingProvider = this.readPayPalPayload(existingPayment?.providerPayload);
    const existingPayPalOrderId = existingPayment?.providerOrderId ?? existingProvider?.paypalOrderId;
    if (existingPayment?.status === "PENDING" && existingPayPalOrderId && existingProvider?.approvalUrl) {
      return { order, paypalOrderId: existingPayPalOrderId, approvalUrl: existingProvider.approvalUrl, expiresIn: 10_800 };
    }
    try {
      const accessToken = await this.getPayPalAccessToken(configured.apiBase, configured.clientId, configured.clientSecret);
      const amount = new Prisma.Decimal(order.totalAmount).toFixed(2);
      const returnUrl = this.payPalCheckoutUrl("return", order.id);
      const cancelUrl = this.payPalCheckoutUrl("cancel", order.id);
      const response = await this.fetchWithTimeout(`${configured.apiBase}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          "PayPal-Request-ID": `aquarium-create-${order.id}`,
          ...(this.config.get<string | undefined>("PAYPAL_PARTNER_ATTRIBUTION_ID") ? { "PayPal-Partner-Attribution-Id": this.config.get<string>("PAYPAL_PARTNER_ATTRIBUTION_ID") } : {}),
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: order.orderNumber,
            invoice_id: order.orderNumber,
            description: `Aquarium Shop order ${order.orderNumber}`,
            amount: { currency_code: "USD", value: amount },
          }],
          application_context: {
            brand_name: "Aquarium Shop",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        }),
      });
      const data = await this.readJson(response);
      if (!response.ok) throw new ServiceUnavailableException("PayPal could not create the checkout session");
      const paypalOrderId = typeof data.id === "string" ? data.id : "";
      const approvalUrl = this.getPayPalApprovalUrl(data.links);
      if (!paypalOrderId || !approvalUrl || data.status !== "CREATED") {
        throw new ServiceUnavailableException("PayPal returned an invalid checkout session");
      }
      const payload: PayPalPaymentPayload = { paypalOrderId, approvalUrl, amount, currencyCode: "USD", status: "CREATED", createdAt: new Date().toISOString() };
      const reservationTtl = this.config.get<number>("PAYMENT_RESERVATION_TTL_SECONDS", 10_800);
      await this.prisma.payment.update({ where: { orderId: order.id }, data: { providerOrderId: paypalOrderId, providerPayload: payload as Prisma.InputJsonValue, checkoutExpiresAt: new Date(Date.now() + reservationTtl * 1000) } });
      return { order, paypalOrderId, approvalUrl, expiresIn: 10_800 };
    } catch (error) {
      await this.orders.failPendingPayment(order.id, customerId, "PayPal checkout could not be created");
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("PayPal checkout is temporarily unavailable");
    }
  }

  /** Re-open an abandoned local PayPal order without creating a second order
   * or reserving stock a second time. This is used by My orders when an older
   * pending checkout has no usable approval URL anymore. */
  async resumePayPalCheckout(orderId: string, customerId: string): Promise<PayPalCheckoutStartResponse> {
    const configured = this.getPayPalCheckoutConfig();
    const current = await this.prisma.order.findFirst({ where: { id: orderId, customerId }, include: { payment: true } });
    if (!current || !current.payment) throw new BadRequestException("PayPal order not found");
    if (current.payment.method !== "PAYPAL" || current.payment.status !== "PENDING" || current.status === OrderStatus.CANCELLED) {
      throw new BadRequestException("This order is no longer payable");
    }
    const existing = this.readPayPalPayload(current.payment.providerPayload);
    if (existing?.paypalOrderId && existing.approvalUrl && (!current.payment.checkoutExpiresAt || current.payment.checkoutExpiresAt.getTime() > Date.now())) {
      const expiresAt = current.payment.checkoutExpiresAt?.getTime() ?? Date.now() + 10_800_000;
      return { order: await this.orders.getById(orderId), paypalOrderId: existing.paypalOrderId, approvalUrl: existing.approvalUrl, expiresIn: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)) };
    }

    const order = await this.orders.getById(orderId);
    try {
      const accessToken = await this.getPayPalAccessToken(configured.apiBase, configured.clientId, configured.clientSecret);
      const amount = new Prisma.Decimal(order.totalAmount).toFixed(2);
      const response = await this.fetchWithTimeout(`${configured.apiBase}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          "PayPal-Request-ID": `aquarium-resume-${order.id}`,
          ...(this.config.get<string | undefined>("PAYPAL_PARTNER_ATTRIBUTION_ID") ? { "PayPal-Partner-Attribution-Id": this.config.get<string>("PAYPAL_PARTNER_ATTRIBUTION_ID") } : {}),
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: order.orderNumber, invoice_id: order.orderNumber, description: `Aquarium Shop order ${order.orderNumber}`, amount: { currency_code: "USD", value: amount } }],
          application_context: { brand_name: "Aquarium Shop", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: this.payPalCheckoutUrl("return", order.id), cancel_url: this.payPalCheckoutUrl("cancel", order.id) },
        }),
      });
      const data = await this.readJson(response);
      if (!response.ok) throw new ServiceUnavailableException("PayPal could not create the checkout session");
      const paypalOrderId = typeof data.id === "string" ? data.id : "";
      const approvalUrl = this.getPayPalApprovalUrl(data.links);
      if (!paypalOrderId || !approvalUrl || data.status !== "CREATED") throw new ServiceUnavailableException("PayPal returned an invalid checkout session");
      const payload: PayPalPaymentPayload = { paypalOrderId, approvalUrl, amount, currencyCode: "USD", status: "CREATED", createdAt: new Date().toISOString() };
       const reservationTtl = this.config.get<number>("PAYMENT_RESERVATION_TTL_SECONDS", 10_800);
       const updated = await this.prisma.payment.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { providerOrderId: paypalOrderId, providerPayload: payload as Prisma.InputJsonValue, checkoutExpiresAt: new Date(Date.now() + reservationTtl * 1000) } });
      if (updated.count !== 1) throw new BadRequestException("This PayPal checkout is no longer payable");
      return { order: await this.orders.getById(order.id), paypalOrderId, approvalUrl, expiresIn: reservationTtl };
    } catch (error) {
      await this.orders.failPendingPayment(order.id, customerId, "PayPal checkout could not be resumed");
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("PayPal checkout is temporarily unavailable");
    }
  }

  /**
   * Capture only the PayPal order ID that was created by this server. The
   * amount and merchant are checked against the local order before it is
   * marked paid, and the local update is idempotent for refresh/retry safety.
   */
  async capturePayPalCheckout(orderId: string, customerId: string): Promise<PayPalCheckoutCaptureResponse> {
    const configured = this.getPayPalCheckoutConfig();
    const current = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { payment: true },
    });
    if (!current || !current.payment) throw new BadRequestException("PayPal order not found");
    if (current.payment.method !== "PAYPAL") throw new BadRequestException("This order is not a PayPal checkout");
    if (current.payment.status === "PAID") return { order: await this.orders.getById(orderId), captureId: current.payment.transactionCode, status: "COMPLETED" };
    if (current.payment.status !== "PENDING") throw new BadRequestException("This PayPal checkout is no longer payable");
    const provider = this.readPayPalPayload(current.payment.providerPayload) ?? {};
    const paypalOrderId = current.payment.providerOrderId ?? provider.paypalOrderId;
    if (!paypalOrderId) throw new BadRequestException("PayPal checkout session is missing");

    const accessToken = await this.getPayPalAccessToken(configured.apiBase, configured.clientId, configured.clientSecret);
    const response = await this.fetchWithTimeout(`${configured.apiBase}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "PayPal-Request-ID": `aquarium-capture-${orderId}`,
        ...(this.config.get<string | undefined>("PAYPAL_PARTNER_ATTRIBUTION_ID") ? { "PayPal-Partner-Attribution-Id": this.config.get<string>("PAYPAL_PARTNER_ATTRIBUTION_ID") } : {}),
      },
      body: "{}",
    });
    const data = await this.readJson(response);
    if (!response.ok) {
      const issue = this.payPalIssue(data);
      if (issue === "INSTRUMENT_DECLINED" || issue === "TRANSACTION_REFUSED") {
        await this.orders.failPendingPayment(orderId, customerId, "PayPal declined the payment");
        throw new BadRequestException("PayPal declined the payment. Please choose another payment method.");
      }
      throw new ServiceUnavailableException("PayPal did not confirm the payment. Please retry");
    }

    const capture = this.getPayPalCapture(data);
    const status = capture?.status;
    if (status !== "COMPLETED" && status !== "PENDING") {
      await this.orders.failPendingPayment(orderId, customerId, "PayPal did not complete the payment");
      throw new BadRequestException("PayPal did not complete the payment");
    }
    if (!this.matchesPayPalAmount(data, current.totalAmount)) {
      await this.orders.failPendingPayment(orderId, customerId, "PayPal amount or currency did not match the order");
      throw new BadRequestException("The PayPal amount did not match this order");
    }
    const captureId = capture?.id ?? null;
    const nextPayload: PayPalPaymentPayload = { ...provider, paypalOrderId, status, captureId: captureId ?? provider.captureId, capturedAt: new Date().toISOString() };
    if (status === "PENDING") {
      await this.prisma.payment.update({ where: { orderId }, data: { providerOrderId: paypalOrderId, providerCaptureId: captureId, providerPayload: nextPayload as Prisma.InputJsonValue } });
      return { order: await this.orders.getById(orderId), captureId, status };
    }

    await this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findUnique({ where: { orderId }, select: { status: true } });
      if (!payment) throw new BadRequestException("Payment record not found");
      if (payment.status === "PAID") return transaction.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, items: true, customer: { select: { id: true, email: true, fullName: true } }, statusHistory: { orderBy: { createdAt: "asc" } } } });
      await transaction.payment.update({ where: { orderId }, data: { status: "PAID", transactionCode: captureId, providerOrderId: paypalOrderId, providerCaptureId: captureId, paidAt: new Date(), checkoutExpiresAt: null, providerPayload: nextPayload as Prisma.InputJsonValue } });
      await transaction.order.update({ where: { id: orderId }, data: { status: OrderStatus.CONFIRMED } });
      await transaction.orderStatusHistory.create({ data: { orderId, status: OrderStatus.CONFIRMED, note: "PayPal payment captured" } });
      return transaction.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, items: true, customer: { select: { id: true, email: true, fullName: true } }, statusHistory: { orderBy: { createdAt: "asc" } } } });
    });
    void this.orders.notifyOrderConfirmation(orderId).catch(() => undefined);
    return { order: await this.orders.getById(orderId), captureId, status: "COMPLETED" };
  }

  async cancelPayPalCheckout(orderId: string, customerId: string): Promise<OrderResponse> {
    return this.orders.failPendingPayment(orderId, customerId, "PayPal checkout was cancelled");
  }

  /**
   * Issue a server-side full refund for a captured PayPal payment. The
   * deterministic request ID makes retries safe if the browser or worker
   * loses the response after PayPal accepted the refund.
   */
  async refundPayPalCapture(orderId: string): Promise<PayPalRefundResponse> {
    const configured = this.getPayPalCheckoutConfig();
    const current = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!current?.payment || current.payment.method !== "PAYPAL") {
      throw new BadRequestException("This order does not have a PayPal payment");
    }
    if (current.payment.status !== "PAID") {
      throw new BadRequestException("A captured PayPal payment is required before refunding");
    }
    const provider = this.readPayPalPayload(current.payment.providerPayload) ?? {};
    const captureId = current.payment.providerCaptureId ?? provider.captureId ?? current.payment.transactionCode;
    if (!captureId) throw new BadRequestException("PayPal capture reference is missing");

    const accessToken = await this.getPayPalAccessToken(configured.apiBase, configured.clientId, configured.clientSecret);
    const response = await this.fetchWithTimeout(`${configured.apiBase}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "PayPal-Request-ID": `aquarium-refund-${orderId}`,
        ...(this.config.get<string | undefined>("PAYPAL_PARTNER_ATTRIBUTION_ID") ? { "PayPal-Partner-Attribution-Id": this.config.get<string>("PAYPAL_PARTNER_ATTRIBUTION_ID") } : {}),
      },
      body: JSON.stringify({}),
    });
    const data = await this.readJson(response);
    if (!response.ok) {
      if (response.status === 422 && this.payPalIssue(data) === "INSTRUMENT_DECLINED") {
        throw new BadRequestException("PayPal could not process this refund yet");
      }
      throw new ServiceUnavailableException("PayPal could not process the refund");
    }
    const refundId = typeof data.id === "string" ? data.id : "";
    const status = typeof data.status === "string" ? data.status : "";
    if (!refundId || !["COMPLETED", "PENDING"].includes(status)) {
      throw new ServiceUnavailableException("PayPal returned an invalid refund response");
    }
    return { refundId, status };
  }

  /** Verify PayPal's signed notification before touching order state. */
  async receivePayPalWebhook(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): Promise<{ received: true }> {
    const webhookId = this.config.get<string | undefined>("PAYPAL_WEBHOOK_ID");
    if (!webhookId) throw new ServiceUnavailableException("PayPal webhook is not configured");
    const transmissionId = this.header(headers, "paypal-transmission-id");
    const transmissionTime = this.header(headers, "paypal-transmission-time");
    const transmissionSig = this.header(headers, "paypal-transmission-sig");
    const certUrl = this.header(headers, "paypal-cert-url");
    const authAlgo = this.header(headers, "paypal-auth-algo");
    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      throw new BadRequestException("PayPal webhook headers are incomplete");
    }
    const configured = this.getPayPalCheckoutConfig();
    const accessToken = await this.getPayPalAccessToken(configured.apiBase, configured.clientId, configured.clientSecret);
    const verifyResponse = await this.fetchWithTimeout(`${configured.apiBase}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ auth_algo: authAlgo, cert_url: certUrl, transmission_id: transmissionId, transmission_sig: transmissionSig, transmission_time: transmissionTime, webhook_id: webhookId, webhook_event: body }),
    });
    const verification = await this.readJson(verifyResponse);
    if (!verifyResponse.ok || verification.verification_status !== "SUCCESS") {
      throw new BadRequestException("PayPal webhook signature is invalid");
    }

    const eventType = typeof body.event_type === "string" ? body.event_type : "";
    if (!["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED", "CHECKOUT.PAYMENT-APPROVAL.REVERSED"].includes(eventType)) {
      return { received: true };
    }
    const eventId = typeof body.id === "string" ? body.id : "";
    if (!eventId) throw new BadRequestException("PayPal webhook event id is missing");
    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: "PAYPAL",
          eventId,
          eventType,
          payload: body as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error: unknown) {
      // PayPal retries events until acknowledged. A unique event record turns
      // those retries into harmless no-ops instead of duplicate transitions.
      // If a previous worker crashed after recording the event but before
      // updating the payment, continue processing it; the payment transaction
      // below is itself guarded by the current status.
      if ((error as { code?: unknown }).code !== "P2002") throw error;
    }
    const resource = body.resource && typeof body.resource === "object" && !Array.isArray(body.resource) ? body.resource as Record<string, unknown> : {};
    const related = resource.supplementary_data && typeof resource.supplementary_data === "object" && !Array.isArray(resource.supplementary_data) ? (resource.supplementary_data as Record<string, unknown>).related_ids : null;
    const paypalOrderId = related && typeof related === "object" && !Array.isArray(related) && typeof (related as Record<string, unknown>).order_id === "string" ? (related as Record<string, unknown>).order_id as string : null;
    const captureId = typeof resource.id === "string" ? resource.id : null;
    const identifiers = [
      ...(paypalOrderId ? [{ providerOrderId: paypalOrderId }] : []),
      ...(captureId ? [{ providerCaptureId: captureId }, { transactionCode: captureId }] : []),
    ];
    const match = identifiers.length
      ? await this.prisma.payment.findFirst({ where: { method: "PAYPAL", status: { in: ["PENDING", "PAID"] }, OR: identifiers }, include: { order: true } })
      : null;
    if (!match) return { received: true };
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const amount = resource.amount && typeof resource.amount === "object" && !Array.isArray(resource.amount) ? resource.amount as Record<string, unknown> : {};
      if (amount.currency_code !== "USD" || typeof amount.value !== "string" || !new Prisma.Decimal(amount.value).eq(match.amount)) throw new BadRequestException("PayPal webhook amount did not match the order");
      const provider = this.readPayPalPayload(match.providerPayload) ?? {};
      await this.prisma.$transaction(async (transaction) => {
        const payment = await transaction.payment.findUnique({ where: { orderId: match.orderId }, select: { status: true } });
        if (!payment || payment.status === "PAID") return;
        await transaction.payment.update({ where: { orderId: match.orderId }, data: { status: "PAID", transactionCode: captureId, providerOrderId: paypalOrderId, providerCaptureId: captureId, paidAt: new Date(), providerPayload: { ...provider, paypalOrderId: paypalOrderId ?? provider.paypalOrderId, status: "COMPLETED", captureId, capturedAt: new Date().toISOString() } } });
        await transaction.order.update({ where: { id: match.orderId }, data: { status: OrderStatus.CONFIRMED } });
        await transaction.orderStatusHistory.create({ data: { orderId: match.orderId, status: OrderStatus.CONFIRMED, note: "PayPal webhook confirmed payment" } });
      });
      void this.orders.notifyOrderConfirmation(match.orderId).catch(() => undefined);
    } else if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
      if (match.status === "PAID") {
        const provider = this.readPayPalPayload(match.providerPayload) ?? {};
        await this.prisma.payment.update({ where: { orderId: match.orderId }, data: { status: "REFUNDED", providerCaptureId: captureId ?? match.providerCaptureId, providerPayload: { ...provider, status: "REFUNDED", captureId: captureId ?? provider.captureId, capturedAt: new Date().toISOString() } } });
      }
    } else if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "CHECKOUT.PAYMENT-APPROVAL.REVERSED") {
      if (match.order.customerId) await this.orders.failPendingPayment(match.orderId, match.order.customerId, "PayPal reported that the payment was not completed");
    }
    return { received: true };
  }

  private getPayPalCheckoutConfig(): { apiBase: string; clientId: string; clientSecret: string } {
    const clientId = this.config.get<string | undefined>("PAYPAL_CLIENT_ID");
    const clientSecret = this.config.get<string | undefined>("PAYPAL_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new ServiceUnavailableException("PayPal checkout is not configured on the server");
    return { apiBase: this.payPalApiBase(), clientId, clientSecret };
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string): string | null {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] ?? null : typeof value === "string" ? value : null;
  }

  private payPalCheckoutUrl(result: "return" | "cancel", orderId: string): string {
    const url = new URL("/shop/checkout", this.getFrontendUrl());
    url.searchParams.set("paypal", result);
    url.searchParams.set("orderId", orderId);
    return url.toString();
  }

  private getPayPalApprovalUrl(links: unknown): string | null {
    if (!Array.isArray(links)) return null;
    const link = links.find((value) => typeof value === "object" && value !== null && (value as { rel?: unknown }).rel === "approve") as { href?: unknown } | undefined;
    if (typeof link?.href !== "string") return null;
    try {
      const host = new URL(link.href).hostname.toLowerCase();
      if (host !== "paypal.com" && !host.endsWith(".paypal.com")) return null;
      return link.href;
    } catch { return null; }
  }

  private readPayPalPayload(value: unknown): PayPalPaymentPayload | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    return {
      paypalOrderId: typeof payload.paypalOrderId === "string" ? payload.paypalOrderId : undefined,
      approvalUrl: typeof payload.approvalUrl === "string" ? payload.approvalUrl : undefined,
      amount: typeof payload.amount === "string" ? payload.amount : undefined,
      currencyCode: typeof payload.currencyCode === "string" ? payload.currencyCode : undefined,
      captureId: typeof payload.captureId === "string" ? payload.captureId : undefined,
      status: typeof payload.status === "string" ? payload.status : undefined,
      createdAt: typeof payload.createdAt === "string" ? payload.createdAt : undefined,
      capturedAt: typeof payload.capturedAt === "string" ? payload.capturedAt : undefined,
    };
  }

  private getPayPalCapture(data: Record<string, unknown>): { id: string | null; status: string | null } | null {
    const units = Array.isArray(data.purchase_units) ? data.purchase_units.filter(isRecord) : [];
    const first = units[0];
    const payments = isRecord(first?.payments) ? first.payments : null;
    const captures = payments && Array.isArray(payments.captures) ? payments.captures.filter(isRecord) : [];
    const capture = captures[0];
    if (!capture) return null;
    return { id: typeof capture.id === "string" ? capture.id : null, status: typeof capture.status === "string" ? capture.status : null };
  }

  private matchesPayPalAmount(data: Record<string, unknown>, localAmount: string | Prisma.Decimal): boolean {
    const capture = this.getPayPalCapture(data);
    const units = Array.isArray(data.purchase_units) ? data.purchase_units.filter(isRecord) : [];
    const first = units[0];
    const payments = isRecord(first?.payments) ? first.payments : null;
    const captures = payments && Array.isArray(payments.captures) ? payments.captures.filter(isRecord) : [];
    const captureRow = captures[0];
    const amount = isRecord(captureRow?.amount) ? captureRow.amount : null;
    const currency = amount?.currency_code;
    const value = amount?.value;
    return Boolean(capture && currency === "USD" && typeof value === "string" && new Prisma.Decimal(value).eq(new Prisma.Decimal(localAmount.toString())));
  }

  private payPalIssue(data: Record<string, unknown>): string | null {
    const details = Array.isArray(data.details) ? data.details.filter(isRecord) : [];
    const first = details[0];
    return typeof first?.issue === "string" ? first.issue : null;
  }

  private async getStoredProviderConnections(): Promise<StoredProviderConnections> {
    const row = await this.prisma.paymentSettings.findUnique({ where: { id: "default" }, select: { providerConnections: true } });
    if (!row?.providerConnections || typeof row.providerConnections !== "object" || Array.isArray(row.providerConnections)) return {};
    return row.providerConnections;
  }

  private async saveProviderConnections(next: StoredProviderConnections, updatedBy: string, current: PaymentSettingsResponse): Promise<void> {
    await this.prisma.paymentSettings.upsert({
      where: { id: "default" },
      create: { id: "default", country: current.country, currency: current.currency, defaultMethod: current.defaultMethod, methods: current.methods as unknown as Prisma.InputJsonValue, providerConnections: next as unknown as Prisma.InputJsonValue, updatedBy },
      update: { providerConnections: next as unknown as Prisma.InputJsonValue, updatedBy },
    });
  }

  private payPalApiBase(): string {
    return this.config.get<string>("PAYPAL_ENVIRONMENT", "live") === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  }

  private async getPayPalAccessToken(apiBase: string, clientId: string, clientSecret: string): Promise<string> {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await this.fetchWithTimeout(`${apiBase}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    if (!response.ok) throw new ServiceUnavailableException("PayPal credentials không hợp lệ hoặc app chưa được cấp quyền");
    const data = await this.readJson(response);
    if (typeof data?.access_token !== "string") throw new ServiceUnavailableException("PayPal không trả về access token");
    return data.access_token;
  }

  private async verifyPayPalMerchant(merchantId: string): Promise<void> {
    const clientId = this.config.get<string | undefined>("PAYPAL_CLIENT_ID");
    const clientSecret = this.config.get<string | undefined>("PAYPAL_CLIENT_SECRET");
    const partnerMerchantId = this.config.get<string | undefined>("PAYPAL_PARTNER_MERCHANT_ID");
    if (!clientId || !clientSecret || !partnerMerchantId) throw new ServiceUnavailableException("PayPal partner verification chưa được cấu hình");
    const apiBase = this.payPalApiBase();
    const accessToken = await this.getPayPalAccessToken(apiBase, clientId, clientSecret);
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: clientId, payer_id: partnerMerchantId })).toString("base64url");
    const authAssertion = `${header}.${payload}.`;
    const response = await this.fetchWithTimeout(`${apiBase}/v1/customer/partners/${encodeURIComponent(partnerMerchantId)}/merchant-integrations/${encodeURIComponent(merchantId)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Auth-Assertion": authAssertion,
        ...(this.config.get<string | undefined>("PAYPAL_PARTNER_ATTRIBUTION_ID") ? { "PayPal-Partner-Attribution-Id": this.config.get<string>("PAYPAL_PARTNER_ATTRIBUTION_ID") } : {}),
      },
    });
    if (!response.ok) throw new ServiceUnavailableException("PayPal chưa xác minh được merchant connection");
    const data = await this.readJson(response);
    if (data.merchant_id !== merchantId || data.payments_receivable !== true || data.primary_email_confirmed !== true || !this.hasPayPalConsent(data)) {
      throw new ServiceUnavailableException("PayPal merchant chưa hoàn tất xác minh và cấp quyền thanh toán");
    }
  }

  private hasPayPalConsent(data: Record<string, unknown>): boolean {
    const integrations = Array.isArray(data.oauth_integrations) ? data.oauth_integrations : [];
    return integrations.some((integration: unknown) => typeof integration === "object" && integration !== null && (integration as { integration_type?: string }).integration_type === "OAUTH_THIRD_PARTY");
  }

  private async fetchWithTimeout(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = this.config.get<number>("REQUEST_TIMEOUT_MS", 30_000);
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    try { return await response.json() as Record<string, unknown>; } catch { return {}; }
  }

  private signPayPalState(payload: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("JWT_ACCESS_SECRET")).update(payload).digest("base64url");
  }

  private verifyPayPalState(value: string): { userId: string } {
    const separator = value.lastIndexOf(".");
    if (separator < 1) throw new BadRequestException("PayPal callback state không hợp lệ");
    const payload = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    const expected = this.signPayPalState(payload);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new BadRequestException("PayPal callback state không hợp lệ");
    const [encodedUserId, expiresAt] = payload.split(".");
    let userId: string;
    try { userId = Buffer.from(encodedUserId, "base64url").toString("utf8"); } catch { throw new BadRequestException("PayPal callback state không hợp lệ"); }
    if (!userId || !/^\w{8}-\w{4}-[1-5]\w{3}-[89ab]\w{3}-\w{12}$/i.test(userId) || !/^\d+$/.test(expiresAt) || Number(expiresAt) < Math.floor(Date.now() / 1000)) throw new BadRequestException("PayPal callback đã hết hạn");
    return { userId };
  }

  async getSettings(): Promise<PaymentSettingsResponse> {
    const stored = await this.prisma.paymentSettings.findUnique({ where: { id: "default" } });
    if (!stored) return { country: "US", currency: "USD", defaultMethod: "PAYPAL", methods: this.availableMethods(DEFAULT_METHODS), updatedAt: new Date() };
    return this.serialize(stored);
  }

  async updateSettings(dto: UpdatePaymentSettingsDto, updatedBy?: string): Promise<PaymentSettingsResponse> {
    const ids = dto.methods.map((method) => method.id);
    if (new Set(ids).size !== ids.length || ids.length !== PAYMENT_METHOD_IDS.length || PAYMENT_METHOD_IDS.some((id) => !ids.includes(id))) {
      throw new BadRequestException("Danh sách phương thức thanh toán chưa đầy đủ hoặc bị trùng");
    }
    if (!dto.methods.some((method) => method.id === dto.defaultMethod && method.enabled)) {
      throw new BadRequestException("Phương thức mặc định phải đang được bật");
    }
    const requestedCard = dto.methods.find((method) => method.id === "CARD");
    if (requestedCard?.enabled && !this.cardProcessorReady()) {
      throw new BadRequestException("Card checkout is disabled until a PCI-compliant hosted card processor is configured");
    }
    const methods = DEFAULT_METHODS.map((method) => ({ ...method, enabled: dto.methods.find((item) => item.id === method.id)?.enabled ?? method.enabled }));
    const stored = await this.prisma.paymentSettings.upsert({
      where: { id: "default" },
      create: { id: "default", country: "US", currency: dto.currency, defaultMethod: dto.defaultMethod, methods, updatedBy: updatedBy ?? null },
      update: { currency: dto.currency, defaultMethod: dto.defaultMethod, methods, updatedBy: updatedBy ?? null },
    });
    return this.serialize(stored);
  }

  async getPublicMethods(): Promise<{ country: "US"; currency: "USD"; defaultMethod: PaymentMethodId; methods: Array<Pick<PaymentMethodConfig, "id" | "provider" | "label" | "description">> }> {
    const settings = await this.getSettings();
    return { country: settings.country, currency: settings.currency, defaultMethod: settings.defaultMethod, methods: settings.methods.filter((method) => method.enabled).map(({ id, provider, label, description }) => ({ id, provider, label, description })) };
  }

  private serialize(row: { country: string; currency: string; defaultMethod: string; methods: unknown; updatedAt: Date }): PaymentSettingsResponse {
    const storedMethods = Array.isArray(row.methods) ? row.methods as Partial<PaymentMethodConfig>[] : [];
    const methods = this.availableMethods(DEFAULT_METHODS.map((method) => ({ ...method, enabled: storedMethods.find((item) => item.id === method.id)?.enabled ?? method.enabled })));
    const requestedDefault = PAYMENT_METHOD_IDS.includes(row.defaultMethod as PaymentMethodId) ? row.defaultMethod as PaymentMethodId : "PAYPAL";
    const defaultMethod = methods.some((method) => method.id === requestedDefault && method.enabled)
      ? requestedDefault
      : methods.find((method) => method.enabled)?.id ?? "PAYPAL";
    return { country: "US", currency: row.currency === "USD" ? "USD" : "USD", defaultMethod, methods, updatedAt: row.updatedAt };
  }

  private cardProcessorReady(): boolean {
    return this.config.get<boolean>("CARD_PROCESSOR_READY", false);
  }

  private availableMethods(methods: PaymentMethodConfig[]): PaymentMethodConfig[] {
    return methods.map((method) => method.id === "CARD" && !this.cardProcessorReady() ? { ...method, enabled: false } : method);
  }
}
