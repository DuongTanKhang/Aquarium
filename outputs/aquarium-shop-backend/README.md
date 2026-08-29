# Aquarium Shop Backend

Backend REST API for an aquarium fish e-commerce store, built as a NestJS modular monolith with PostgreSQL and Prisma.

## Modules

- `auth`: sign-in, email verification, password recovery, MFA, sessions, and authorization.
- `users`: administrators, staff, and customer accounts.
- `categories`: product classification.
- `products`: fish, aquariums, food, plants, and accessories.
- `inventory`: stock movements and low-stock alerts.
- `customers`: customer profiles and history.
- `orders`: checkout, order items, and status transitions.
- `payments`: checkout method configuration plus server-side provider onboarding hooks.
- `media`: product image upload and storage integration.
- `dashboard`: sales, order, customer, and stock metrics.
- `health`: service health checks.

## Authentication security

- Short-lived, issuer/audience-bound HS256 access tokens.
- Opaque refresh tokens stored only in `HttpOnly`, `SameSite=Lax` cookies.
- Refresh-token rotation with token-family reuse detection.
- Server-side session validation on every protected request for immediate revocation.
- Argon2id password hashing, temporary lockout, global rate limiting, and RBAC.
- Security audit events without storing raw credentials or tokens.
- Registration immediately issues a single-use email verification link; checkout also requires a verified US phone. Tokens/codes expire and only HMAC hashes are stored.
- TOTP MFA secrets encrypted with AES-256-GCM and ten single-use recovery codes.
- Signed, five-minute MFA login challenges with attempt limits and replay protection.
- Password reset and MFA state changes revoke all previous sessions.
- In local development, admin routes work before MFA enrollment. Set `REQUIRE_ADMIN_MFA=true` in production to require MFA for admin/dashboard routes.
- Production startup rejects HTTP frontend/CORS origins, weak development secrets, disabled admin MFA, console-mode verification, incomplete Twilio delivery, missing PayPal credentials/webhook verification, and sandbox PayPal credentials.
- Helmet security headers, `Cache-Control: no-store` for API responses, exact-origin CORS, and an Origin check for state-changing requests.
- Swagger API documentation is available only outside production; production error responses omit validation details.

## Performance and resilience

- PostgreSQL uses a bounded connection pool (`DATABASE_POOL_MAX`) with connection and idle timeouts so one instance cannot consume every database connection.
- Dashboard summary requests use a short stale-while-revalidate cache and share an in-flight query, preventing a refresh/query stampede when multiple tabs are open. Set `DASHBOARD_CACHE_TTL_SECONDS=0` to disable it.
- Node request, header, keep-alive, and JSON body limits are explicit. Oversized or stalled requests are rejected instead of tying up workers indefinitely.
- `GET /api/v1/health` is a liveness check; `GET /api/v1/health/ready` verifies the database connection and is suitable for a load balancer or container readiness probe.
- The production image includes a Docker healthcheck. Run multiple API instances behind a reverse proxy/load balancer for horizontal scaling; keep the sum of their pool sizes below PostgreSQL's connection budget.
- The browser API client times out requests and retries only idempotent reads on transient network/5xx/429 failures. Mutations are never automatically replayed.

Public endpoints are explicitly marked; every other controller is protected by default.

### Auth endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/mfa/verify-login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/email/send-verification`
- `POST /api/v1/auth/email/verify`
- `POST /api/v1/auth/phone/send-verification` — sends a short-lived US SMS code (console mode for local development, Twilio in production).
- `POST /api/v1/auth/phone/verify` — consumes the latest one-time phone code.
- `POST /api/v1/auth/password/forgot`
- `POST /api/v1/auth/password/reset`
- `POST /api/v1/auth/mfa/setup`
- `POST /api/v1/auth/mfa/enable`
- `POST /api/v1/auth/mfa/recovery-codes`
- `POST /api/v1/auth/mfa/disable`
- `GET /api/v1/auth/me`
- `POST /api/v1/contact` — rate-limited customer contact form; sends a plain-text message to `CONTACT_RECIPIENT` (or the SMTP account when omitted).

### Admin dashboard endpoints

All endpoints below require a valid admin/staff bearer token. Decimal money values are returned as strings.

- `GET /api/v1/admin/dashboard/summary` — counters, revenue change, trend, category mix, recent orders, and top products.
- `GET /api/v1/admin/dashboard/analytics?days=30` — analytics for 7–365 days.
- `GET /api/v1/admin/orders?page=1&pageSize=20&search=&status=&fromDate=&toDate=` — sales order queue with inclusive calendar-date filtering. Use the same date for both bounds to filter one day.
- `GET /api/v1/admin/orders/:id` — order detail with items and payment.
- `PATCH /api/v1/admin/orders/:id/status` — append an auditable fulfillment status history entry.
- `POST /api/v1/orders` — authenticated customer storefront checkout. Browsing stays public, but checkout requires a CUSTOMER session; the server re-reads active product prices, validates stock, associates the order with that customer, decrements inventory, and writes SALE audit rows in one transaction.
- `POST /api/v1/payments/paypal/orders` — creates a local pending order and a PayPal Orders v2 checkout session. The response contains only the PayPal approval URL; amount and currency are calculated on the server.
- `POST /api/v1/payments/paypal/orders/:id/capture` — server-side capture after PayPal approval. It verifies the captured amount/currency, uses an idempotent request ID, and only then changes the local payment to `PAID` and order to `CONFIRMED`.
- `POST /api/v1/payments/paypal/orders/:id/cancel` — releases a pending PayPal stock reservation when the buyer cancels.
- `POST /api/v1/payments/paypal/webhook` — verifies PayPal's webhook signature before accepting completed, denied, reversed, or refunded events. Set `PAYPAL_WEBHOOK_ID` in the API environment.
- `GET /api/v1/orders/mine` — list the signed-in customer's own orders with status history for tracking.
- `POST /api/v1/orders/lookup` — exact email + order number lookup for a guest/device that is not signed in.
- `GET /api/v1/account/profile` — read the signed-in customer's own profile.
- `PATCH /api/v1/account/profile` — update only the signed-in customer's name, US phone, delivery address and compressed avatar; admin/staff tokens are rejected.
- `GET /api/v1/admin/customers?page=1&pageSize=20&search=` — customer value and order totals.
- `GET /api/v1/admin/customers/:id` — customer detail and lifetime totals.
- `GET /api/v1/admin/inventory/low-stock?page=1&pageSize=20&threshold=5` — low-stock action queue.
- `POST /api/v1/admin/inventory/:productId/adjust` — transactional stock import, sale, return, damage, or adjustment.
- `GET /api/v1/admin/payment-settings` — current US/USD checkout methods and default method.
- `PATCH /api/v1/admin/payment-settings` — update enabled methods and the default method. Provider secrets stay in server environment variables.
- `GET /api/v1/admin/payment-settings/connections` — non-secret PayPal connection status for the admin UI.
- `GET /api/v1/admin/payment-settings/paypal/connect` — creates a one-time PayPal Partner Referrals onboarding URL when `PAYPAL_INTEGRATION_MODE=connect`. It requires a PayPal-approved partner app, server-only client credentials, partner merchant ID, and a registered HTTPS return URL. In the default `direct` mode (recommended for this one-admin shop), the UI opens PayPal Developer instead; there is no OAuth callback to fake a connection.
- `GET /api/v1/admin/payment-settings/public` — public checkout-safe list of enabled methods; contains no credentials.
- Card checkout still needs a PCI-compliant hosted card processor before it can be enabled for real charges. The current `CARD` option creates a pending order only; it never accepts raw card data and must not be presented as a paid transaction.
- `GET /api/v1/payments/paypal/callback` — verifies the signed onboarding state and PayPal merchant status before storing the merchant ID; it redirects back to the Payment page.

Payment safety: do not collect card numbers, CVV, bank passwords, or routing/account numbers in this app. The customer is redirected to PayPal's hosted checkout; the API creates/captures the PayPal order and never trusts a browser-supplied amount. A browser redirect alone never marks an order as paid. Configure PayPal hosted onboarding and payout accounts with their dashboards; only provider IDs and masked status are surfaced here. PayPal Connect is not the same as opening `paypal.com/businessmanage`: the Partner Referrals flow must return to the callback and the server verifies the merchant before showing Connected. Catalog and checkout amounts are USD. The one-time migration `20260829100000_convert_prices_to_usd_and_returns` converts existing seed values at 25,000 VND = 1 USD; all new product prices must be entered as USD.

### PayPal setup

For this single-admin store, keep `PAYPAL_INTEGRATION_MODE=direct` and create a REST app in the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/live). Put the app's client ID and secret in the backend `.env` only, then restart the API:

```dotenv
PAYPAL_INTEGRATION_MODE=direct
PAYPAL_CLIENT_ID=your-live-client-id
PAYPAL_CLIENT_SECRET=your-live-client-secret
PAYPAL_MERCHANT_ID=your-paypal-merchant-id
PAYPAL_WEBHOOK_ID=your-registered-webhook-id
PAYPAL_SETUP_URL=https://developer.paypal.com/dashboard/applications/live
```

Do not paste the secret into the dashboard or commit it to Git. The API reads it at startup and only returns safe booleans/IDs to the browser. Use `sandbox` credentials and `PAYPAL_ENVIRONMENT=sandbox` until the checkout/webhook flow has been tested. Set `connect` only if PayPal has approved this application as a platform partner and supplied `PAYPAL_PARTNER_MERCHANT_ID` plus a public HTTPS `PAYPAL_RETURN_URL`.

For a production launch, also set `SMS_MODE=twilio` with a verified US Twilio number and configure `PAYPAL_WEBHOOK_ID`; the API intentionally refuses to boot with console SMS or without webhook reconciliation. Refund/return requests are persisted with an auditable status workflow. An administrator must record the payment provider's refund reference before marking a request `REFUNDED`; the API never claims a refund happened from a browser redirect alone. Configure SMTP for real order-confirmation and shipping emails; local `MAIL_MODE=console` only logs a safe development preview.

## Local setup

1. Copy `.env.example` to `.env` and replace every secret placeholder. Generate independent random values; `MFA_ENCRYPTION_KEY_BASE64` must decode to exactly 32 bytes. Tune `DATABASE_POOL_MAX` per API instance rather than setting it high blindly.
2. Install dependencies with `npm install`.
3. Start PostgreSQL with `docker compose up -d postgres`.
4. Generate Prisma Client with `npm run prisma:generate`.
5. Create the database with `npm run db:migrate -- --name init`.
6. Seed initial data with `npm run db:seed`.
7. Start the API with `npm run start:dev`.

If Docker Desktop is unavailable, run `npm run dev:local`. This initializes a disposable PostgreSQL cluster under the workspace, applies migrations, and starts the API on port `4000` without requiring the `aquarium` database password on port `5432`. In a second terminal, seed the admin against that local database:

```powershell
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:55432/aquarium_shop?schema=public"
$env:SEED_ADMIN_EMAIL = "barbiecute306@gmail.com"
$env:SEED_ADMIN_PASSWORD = "use-a-password-with-at-least-12-characters"
npm run db:seed
```

The API runs at `http://localhost:4000/api/v1`. Swagger is available at `http://localhost:4000/api/docs`.

In development, `MAIL_MODE=console` writes verification/reset links and codes to the API log. For real Gmail delivery:

1. Turn on 2-Step Verification for the sending Google account.
2. Create a Google App Password (16 characters) at <https://myaccount.google.com/apppasswords>.
3. Set `MAIL_MODE=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` to the Gmail address, `SMTP_PASSWORD` to the App Password (remove any display spaces), and `MAIL_FROM` to that address.
4. Restart the API and test registration/password reset. The App Password is a secret: keep it only in the server `.env`, never in the browser, repository, or chat.

When `MAIL_MODE=smtp`, the API refuses to start unless the SMTP host, user, and password are present; this prevents verification requests from being accepted while no email can actually be delivered. Production configuration is rejected unless `MAIL_MODE=smtp`, `SMTP_HOST`, `SMS_MODE=twilio`, PayPal credentials/webhook, and non-development security secrets are supplied.

The seed creates a verified administrator only when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are configured. The admin must then enroll TOTP MFA before opening dashboard routes. Recovery codes are returned only once when MFA is enabled or regenerated; store them outside the application.

## Verification

```bash
npm run format
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npx prisma validate
npm audit
```

## First implementation milestones

1. Add category and product CRUD endpoints.
2. Implement transactional inventory adjustments.
3. Implement order creation and guarded status transitions.
4. Expand dashboard revenue and recent-order endpoints.
5. Add S3-compatible media storage and payment webhooks.
