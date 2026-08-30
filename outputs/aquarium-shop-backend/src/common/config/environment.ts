import { z } from "zod";

const environmentBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const DEVELOPMENT_MFA_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z
      .string()
      .default(
        "postgresql://aquarium:aquarium@localhost:5432/aquarium_shop?schema=public",
      ),
    // Keep the pool bounded so one API instance cannot exhaust PostgreSQL.
    // Size this per instance when horizontally scaling the API.
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(60_000)
      .default(5_000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    JWT_ACCESS_SECRET: z
      .string()
      .min(64)
      .default(
        "dev-only-access-secret-change-before-production-0123456789abcdef",
      ),
    REFRESH_TOKEN_PEPPER: z
      .string()
      .min(64)
      .default(
        "dev-only-refresh-pepper-change-before-production-0123456789abcdef",
      ),
    ONE_TIME_TOKEN_PEPPER: z
      .string()
      .min(64)
      .default(
        "dev-only-one-time-token-pepper-change-before-production-0123456789",
      ),
    MFA_ENCRYPTION_KEY_BASE64: z
      .string()
      .refine((value) => Buffer.from(value, "base64").length === 32, {
        message: "MFA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes",
      })
      .default(DEVELOPMENT_MFA_KEY),
    JWT_ISSUER: z.string().min(3).default("aquarium-shop-api"),
    JWT_AUDIENCE: z.string().min(3).default("aquarium-shop-web"),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(3600)
      .default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .max(2592000)
      .default(604800),
    AUTH_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default("aquarium_refresh"),
    AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().min(3).max(20).default(5),
    AUTH_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    MFA_CHALLENGE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(900)
      .default(300),
    EMAIL_VERIFY_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(172800)
      .default(86400),
    PHONE_VERIFY_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(1800)
      .default(600),
    PASSWORD_RESET_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(3600)
      .default(900),
    FRONTEND_URL: z.string().url().default("http://localhost:3000"),
    MAIL_MODE: z.enum(["console", "smtp"]).default("console"),
    MAIL_FROM: z
      .string()
      .min(3)
      .default("Aquarium Shop <no-reply@aquarium.local>"),
    CONTACT_RECIPIENT: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: environmentBoolean.default(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMS_MODE: z.enum(["console", "twilio"]).default("console"),
    TWILIO_ACCOUNT_SID: optionalString,
    TWILIO_AUTH_TOKEN: optionalString,
    TWILIO_FROM_NUMBER: optionalString,
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
    REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(120_000)
      .default(30_000),
    KEEP_ALIVE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(5_000),
    HEADERS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(180_000)
      .default(60_000),
    DASHBOARD_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(60)
      .default(10),
    // Local development can be used before the administrator enrolls MFA.
    // Production deployments should explicitly set this to true.
    REQUIRE_ADMIN_MFA: environmentBoolean.default(false),
    LOW_STOCK_THRESHOLD: z.coerce.number().int().nonnegative().default(5),
    // Payment provider secrets stay on the server. Never expose these through the API.
    PAYPAL_CLIENT_ID: optionalString,
    PAYPAL_CLIENT_SECRET: optionalString,
    PAYPAL_MERCHANT_ID: optionalString,
    PAYPAL_SETUP_URL: optionalString,
    // A single-store deployment should use the store's own PayPal REST app.
    // Partner Referrals is only needed when this app onboards other merchants.
    PAYPAL_INTEGRATION_MODE: z.enum(["direct", "connect"]).default("direct"),
    // Sandbox is the fail-safe default; live payments require an explicit
    // PAYPAL_ENVIRONMENT=live in the server environment.
    PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYPAL_PARTNER_MERCHANT_ID: optionalString,
    PAYPAL_PARTNER_ATTRIBUTION_ID: optionalString,
    PAYPAL_RETURN_URL: optionalString,
    PAYPAL_PARTNER_LOGO_URL: optionalString,
    PAYPAL_WEBHOOK_ID: optionalString,
    // Keep card checkout disabled until a PCI-compliant hosted card
    // processor is configured. This flag is deliberately opt-in and does
    // not collect or validate PAN/CVV data in this API.
    CARD_PROCESSOR_READY: environmentBoolean.default(false),
    PAYMENT_RESERVATION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86_400)
      .default(10_800),
  })
  .superRefine((config, context) => {
    if (config.MAIL_MODE === "smtp" && !config.SMTP_HOST) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required when MAIL_MODE=smtp",
      });
    }

    // SMTP without credentials silently falls back to an unauthenticated
    // connection in nodemailer. Gmail rejects that connection, so fail fast
    // during configuration instead of accepting registrations and then
    // pretending that their verification email was delivered.
    if (config.MAIL_MODE === "smtp" && !config.SMTP_USER) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "SMTP_USER is required when MAIL_MODE=smtp",
      });
    }
    if (config.MAIL_MODE === "smtp" && !config.SMTP_PASSWORD) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_PASSWORD"],
        message:
          "SMTP_PASSWORD is required when MAIL_MODE=smtp (use a Gmail App Password)",
      });
    }

    if (config.NODE_ENV === "production") {
      if (config.MAIL_MODE !== "smtp") {
        context.addIssue({
          code: "custom",
          path: ["MAIL_MODE"],
          message: "Production requires MAIL_MODE=smtp",
        });
      }

      // Checkout requires phone verification. Never let production fall back
      // to logging one-time SMS codes in the API process.
      if (config.SMS_MODE !== "twilio") {
        context.addIssue({
          code: "custom",
          path: ["SMS_MODE"],
          message: "Production requires SMS_MODE=twilio",
        });
      }
      for (const [key, value] of [
        ["TWILIO_ACCOUNT_SID", config.TWILIO_ACCOUNT_SID],
        ["TWILIO_AUTH_TOKEN", config.TWILIO_AUTH_TOKEN],
        ["TWILIO_FROM_NUMBER", config.TWILIO_FROM_NUMBER],
      ] as const) {
        if (!value) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required for production phone verification`,
          });
        }
      }

      for (const [key, secret] of [
        ["JWT_ACCESS_SECRET", config.JWT_ACCESS_SECRET],
        ["REFRESH_TOKEN_PEPPER", config.REFRESH_TOKEN_PEPPER],
        ["ONE_TIME_TOKEN_PEPPER", config.ONE_TIME_TOKEN_PEPPER],
      ] as const) {
        if (/^(dev-only-|replace-with-)/.test(secret)) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} must be replaced before production`,
          });
        }
      }

      if (config.MFA_ENCRYPTION_KEY_BASE64 === DEVELOPMENT_MFA_KEY) {
        context.addIssue({
          code: "custom",
          path: ["MFA_ENCRYPTION_KEY_BASE64"],
          message:
          "MFA_ENCRYPTION_KEY_BASE64 must be replaced before production",
        });
      }

      if (!config.FRONTEND_URL.startsWith("https://")) {
        context.addIssue({
          code: "custom",
          path: ["FRONTEND_URL"],
          message: "FRONTEND_URL must use HTTPS in production",
        });
      }

      const origins = config.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
      if (!origins.length || origins.some((origin) => !origin.startsWith("https://"))) {
        context.addIssue({
          code: "custom",
          path: ["CORS_ORIGIN"],
          message: "CORS_ORIGIN must contain only explicit HTTPS origins in production",
        });
      }

      if (!config.REQUIRE_ADMIN_MFA) {
        context.addIssue({
          code: "custom",
          path: ["REQUIRE_ADMIN_MFA"],
          message: "REQUIRE_ADMIN_MFA=true is required in production",
        });
      }

      if ((config.PAYPAL_CLIENT_ID || config.PAYPAL_CLIENT_SECRET) && config.PAYPAL_ENVIRONMENT !== "live") {
        context.addIssue({
          code: "custom",
          path: ["PAYPAL_ENVIRONMENT"],
          message: "Production PayPal credentials must use PAYPAL_ENVIRONMENT=live",
        });
      }

      // PayPal is enabled by default for the storefront. Fail closed instead
      // of starting a production shop that accepts orders but cannot settle
      // or reconcile them.
      if (!config.PAYPAL_CLIENT_ID) {
        context.addIssue({
          code: "custom",
          path: ["PAYPAL_CLIENT_ID"],
          message: "PAYPAL_CLIENT_ID is required in production",
        });
      }
      if (!config.PAYPAL_CLIENT_SECRET) {
        context.addIssue({
          code: "custom",
          path: ["PAYPAL_CLIENT_SECRET"],
          message: "PAYPAL_CLIENT_SECRET is required in production",
        });
      }
      if (!config.PAYPAL_WEBHOOK_ID) {
        context.addIssue({
          code: "custom",
          path: ["PAYPAL_WEBHOOK_ID"],
          message: "PAYPAL_WEBHOOK_ID is required in production",
        });
      }

    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${result.error.message}`,
    );
  }

  return result.data;
}
