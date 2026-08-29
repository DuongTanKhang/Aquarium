import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPhoneVerification(phone: string, code: string): Promise<void> {
    const mode = this.config.get<string>("SMS_MODE", "console");
    if (mode !== "twilio") {
      this.logger.warn(`[DEV SMS] ${phone} — Aquarium Shop verification code: ${code}`);
      return;
    }

    const accountSid = this.config.get<string>("TWILIO_ACCOUNT_SID");
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN");
    const from = this.config.get<string>("TWILIO_FROM_NUMBER");
    if (!accountSid || !authToken || !from) {
      throw new InternalServerErrorException("SMS provider is not configured");
    }

    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: `Your Aqua verification code is ${code}. It expires in 10 minutes.`,
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      this.logger.error(`Twilio SMS failed with status ${response.status}`);
      throw new InternalServerErrorException("Could not send the phone verification code");
    }
  }
}
