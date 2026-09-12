# G&K Stock production patch

This patch separates the identities correctly:
- **STE G&K DE COMMERCE** is the company using the application.
- **AS TINO DEV** is displayed only as the software developer.

It also adds the supplied G&K logo, mobile/tablet table cards, touch-friendly dialogs and controls, barcode/QR scan during product creation, duplicate barcode checking, production-only identity bootstrap, a demo-tenant purge command, production preflight, and core release gates.

The patch never overwrites `.env`, `.env.production`, `pnpm-lock.yaml`, `node_modules`, or the database automatically. Backups of modified source files are created under `.local/production-patch-backups/`.

After applying, configure the real administrator email before purging the demo tenant. Then purge and bootstrap:

```sh
pnpm client:configure -- --admin-email REAL_ADMIN_EMAIL --admin-name "REAL ADMIN NAME"
CONFIRM_PURGE_DEMO=YES pnpm production:purge-demo
pnpm db:seed
pnpm release:check
```

For hosting, fill real production database, Redis TLS, private S3-compatible storage, SMTP/TLS, domain, HTTPS and fresh secrets in `.env.production`, then run `pnpm production:check` before deployment.
