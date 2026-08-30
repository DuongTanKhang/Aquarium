# P4 release checklist

Use this checklist for the final local/staging verification. It does not
replace the provider and infrastructure checks required for a public launch.

## Automated checks

- `npm run build` and `npm run lint` pass in `outputs/aquarium-shop-backend`.
- `npm test -- --runInBand` passes in `outputs/aquarium-shop-backend`.
- `npm run build` passes in `outputs/aquarium-shop-dashboard`.
- `npx prisma validate` and the database migration job pass.
- `.\scripts\smoke-test.ps1` reports API readiness and HTTP 200 for both hosts.
- The scheduled/PR `Dependency security audit` workflow reports no high or
  critical npm vulnerabilities.

## Staging sign-off

- Register a customer, verify the email through the real SMTP provider, and
  verify the US phone through Twilio.
- Test cash-on-delivery checkout and status updates from the customer and
  admin surfaces.
- Test PayPal sandbox approval, cancellation, capture, webhook reconciliation,
  and the expired-reservation sweep.
- Create a backup, inspect its size, and perform a restore rehearsal against a
  disposable database.
- Confirm that logs contain request IDs but no passwords, tokens, card data, or
  PayPal secrets.

## Public launch gates

- Use a managed/private PostgreSQL instance with point-in-time recovery and an
  encrypted off-host backup policy.
- Put the API and frontend behind a TLS reverse proxy/WAF and configure exact
  HTTPS origins in `CORS_ORIGIN`.
- Set `NODE_ENV=production`, replace all development secrets, enable admin MFA,
  configure Gmail SMTP/Twilio, and register the PayPal webhook.
- Enable card checkout only after a PCI-compliant hosted card processor has
  been selected and tested. This repository never accepts raw PAN/CVV data.
