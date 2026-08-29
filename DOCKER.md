# Aquarium Shop Docker

The root Compose file runs the complete stack together:

- PostgreSQL with a persistent named volume
- NestJS API with Prisma migrations applied before startup
- One Nginx frontend image, exposed as both the admin host and customer host

## Start

From this directory:

```powershell
docker compose up --build -d
```

Open:

- Admin: <http://localhost:4173>
- Customer: <http://localhost:4174/shop>
- API health: <http://localhost:4001/api/v1/health/ready> (the local `.env` uses `API_PORT=4001` because port 4000 is already occupied; use 4000 if you free that port)

The frontend image contains the built React assets and the API proxy. Both
hosts therefore use the same-origin `/api/v1` path and HttpOnly refresh cookie.
The customer URL is used in verification emails by default; set `FRONTEND_URL`
when deploying behind a real domain.

## Before accepting real orders

The local Compose defaults are intentionally development-safe, not sales-ready:

- Set `NODE_ENV=production`, a public HTTPS `FRONTEND_URL`, and exact HTTPS `CORS_ORIGIN` values.
- Replace all development JWT/pepper/MFA secrets and set `REQUIRE_ADMIN_MFA=true`.
- Configure Gmail SMTP (`MAIL_MODE=smtp`) and Twilio SMS (`SMS_MODE=twilio`) so verification codes are never logged.
- Configure live PayPal client credentials and a registered `PAYPAL_WEBHOOK_ID`; the API refuses incomplete production payment setup.
- Catalog and shipping are stored in USD. Migration `20260829100000_convert_prices_to_usd_and_returns` converts the existing sample catalog once at 25,000 VND = 1 USD; review the resulting prices before enabling live sales.
- Add a TLS reverse proxy, backups, monitoring, and a PCI-compliant hosted card processor before public launch. The `CARD` option does not collect card data and does not settle charges yet.

## Admin seed

Create a local `.env` beside this file (do not commit it) with at least:

```env
SEED_ADMIN_EMAIL=your-admin@example.com
SEED_ADMIN_PASSWORD=use-a-long-unique-password
```

Then run the optional seed job once:

```powershell
docker compose --profile seed run --rm seed
```

## Gmail

Set these variables in the same root `.env` before starting/restarting the API:

```env
MAIL_MODE=smtp
MAIL_FROM=Aquarium Shop <your-gmail-address@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASSWORD=your-gmail-app-password
```

`SMTP_PASSWORD` must be a Google App Password, never the normal account
password. Do not put payment or mail secrets in frontend code.

## Useful commands

```powershell
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose down
```

`docker compose down` keeps the database volume. Add `-v` only when you
intentionally want to delete the local database and all its data.
