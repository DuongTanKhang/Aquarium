import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    if (config.getOrThrow<string>("MAIL_MODE") === "smtp") {
      const user = config.getOrThrow<string>("SMTP_USER");
      const pass = config.getOrThrow<string>("SMTP_PASSWORD");
      const secure = config.getOrThrow<boolean>("SMTP_SECURE");

      this.transporter = nodemailer.createTransport({
        pool: true,
        host: config.getOrThrow<string>("SMTP_HOST"),
        port: config.getOrThrow<number>("SMTP_PORT"),
        secure,
        requireTLS: !secure,
        auth: { user, pass },
        maxConnections: 3,
        maxMessages: 100,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    }
  }

  sendVerificationEmail(
    recipient: string,
    fullName: string,
    rawToken: string,
  ): Promise<void> {
    const url = `${this.frontendUrl}/verify-email#token=${encodeURIComponent(rawToken)}`;
    return this.send(
      recipient,
      "Xác minh email Aquarium Shop",
      `Xin chào ${fullName}, mở liên kết sau để xác minh email: ${url}`,
      url,
    );
  }

  sendPasswordResetEmail(
    recipient: string,
    fullName: string,
    resetCode: string,
  ): Promise<void> {
    const url = `${this.frontendUrl}/reset-password#token=${encodeURIComponent(resetCode)}`;
    return this.send(
      recipient,
      "Đặt lại mật khẩu Aquarium Shop",
      `Xin chào ${fullName}, mã xác thực đặt lại mật khẩu của bạn là: ${resetCode}. Mã có hiệu lực trong thời gian ngắn và chỉ dùng một lần. Bạn cũng có thể mở liên kết: ${url}`,
      url,
    );
  }

  sendContactMessage(
    senderName: string,
    senderEmail: string,
    topic: string,
    message: string,
  ): Promise<void> {
    const safeTopic = topic.replace(/[^a-z0-9 _-]/gi, "").slice(0, 60) || "general";
    const recipient = this.config.get<string>("CONTACT_RECIPIENT") || this.config.get<string>("SMTP_USER") || this.config.getOrThrow<string>("MAIL_FROM");
    const text = [
      `New Aquarium Shop contact message`,
      `From: ${senderName.trim().slice(0, 100)} <${senderEmail.trim().toLowerCase().slice(0, 254)}>`,
      `Topic: ${safeTopic}`,
      "",
      message.trim().slice(0, 5000),
    ].join("\n");
    return this.send(
      recipient,
      `Aquarium Shop contact — ${safeTopic}`,
      text,
      "contact message",
    );
  }

  sendOrderConfirmation(
    recipient: string,
    fullName: string,
    orderNumber: string,
    totalUsd: string,
    items: Array<{ productName: string; quantity: number; subtotal: string }>,
  ): Promise<void> {
    const lines = items.map((item) => `- ${item.productName} x${item.quantity}: $${Number(item.subtotal).toFixed(2)}`);
    return this.send(
      recipient,
      `Order ${orderNumber} confirmed — Aquarium Shop`,
      [`Hi ${fullName},`, "", `Thank you for your order ${orderNumber}. Your payment was confirmed.`, "", ...lines, "", `Total: $${Number(totalUsd).toFixed(2)}`, "We will email you again when your order ships.", "", `Track your order: ${this.frontendUrl}/shop/orders`].join("\n"),
      `${this.frontendUrl}/shop/orders`,
    );
  }

  sendOrderStatusUpdate(
    recipient: string,
    fullName: string,
    orderNumber: string,
    status: string,
    note?: string | null,
  ): Promise<void> {
    const readable = status.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    return this.send(
      recipient,
      `Order ${orderNumber} update — ${readable}`,
      [`Hi ${fullName},`, "", `Your order ${orderNumber} is now: ${readable}.`, note ? `Note: ${note}` : "", "", `Track your order: ${this.frontendUrl}/shop/orders`].filter(Boolean).join("\n"),
      `${this.frontendUrl}/shop/orders`,
    );
  }

  private async send(
    recipient: string,
    subject: string,
    text: string,
    developmentUrl: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `[DEV EMAIL] ${recipient} — ${subject}: ${developmentUrl}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.getOrThrow<string>("MAIL_FROM"),
        to: recipient,
        subject,
        text,
      });
    } catch (error) {
      // Keep SMTP details and credentials out of API responses and logs.
      this.logger.error(
        `SMTP delivery failed for ${recipient} (${subject})`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error("Email delivery failed");
    }
  }

  private get frontendUrl(): string {
    return this.config.getOrThrow<string>("FRONTEND_URL").replace(/\/$/, "");
  }
}
