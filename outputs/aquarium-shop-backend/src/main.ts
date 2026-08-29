import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  // Disable Nest's default body parser so the request size is explicit. This
  // protects the process from oversized JSON/urlencoded payloads.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  const port = config.get<number>("PORT", 4000);
  const isProduction = config.get<string>("NODE_ENV") === "production";
  const allowedOrigins = config
    .get<string>("CORS_ORIGIN", "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim());

  app.setGlobalPrefix("api/v1");
  app.set("trust proxy", config.get<number>("TRUST_PROXY", 1));
  app.disable("x-powered-by");
  // Product galleries are sent as compressed data URLs. Keep a bounded payload
  // large enough for the eight-image editor while still rejecting oversized
  // requests before they reach application code.
  app.useBodyParser("json", { limit: "5mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "64kb" });
  app.use(helmet({
    // Never preload HSTS on the local HTTP development server. Production is
    // required to be HTTPS by environment validation below.
    hsts: isProduction ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
    frameguard: { action: "deny" },
  }));
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    // Admin/API responses contain user and payment configuration data. Do not
    // allow an intermediary or browser cache to retain those responses.
    if (request.path.startsWith("/api/v1")) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
    }

    // CORS controls browser reads; this Origin check also blocks cross-site
    // state-changing requests that might otherwise carry the refresh cookie.
    const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const origin = request.get("origin");
    if (unsafeMethod && origin && !allowedOrigins.includes(origin)) {
      response.status(403).json({ message: "Cross-origin request blocked" });
      return;
    }
    next();
  });
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      disableErrorMessages: isProduction,
    }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Aquarium Shop API")
    .setDescription("API for products, inventory, orders, and admin dashboard")
    .setVersion("1.0")
    .addBearerAuth()
    .addCookieAuth(
      config.get<string>("AUTH_COOKIE_NAME", "aquarium_refresh"),
      {
        type: "apiKey",
        in: "cookie",
      },
      "refresh-cookie",
    )
    .build();

  if (!isProduction) {
    SwaggerModule.setup(
      "api/docs",
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  const server = await app.listen(port);
  server.requestTimeout = config.get<number>("REQUEST_TIMEOUT_MS", 30_000);
  server.keepAliveTimeout = config.get<number>(
    "KEEP_ALIVE_TIMEOUT_MS",
    5_000,
  );
  server.headersTimeout = config.get<number>("HEADERS_TIMEOUT_MS", 60_000);
  server.maxHeadersCount = 100;
}

void bootstrap();
