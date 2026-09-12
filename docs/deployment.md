# Deployment on one VPS

## Release prerequisites

Resolve and commit a reviewed lockfile on a network-enabled machine. Pass `lint`, full `typecheck`, unit, integration and E2E suites, `db:validate`, clean migration deployment and both production builds. Test stock concurrency and PDF generation on the target platform. This delivery has not passed these gates in its restricted environment.

Use the production Compose file as a reviewed example, not a one-click security guarantee. Pin image digests after testing; example major tags receive upstream changes. Host capacity must be measured under the expected catalogue, concurrency, reports and PDF load. Do not run the production API under Vercel serverless assumptions.

## Storage and SMTP

Provision a private, maintained S3-compatible endpoint and bucket with versioning. Grant application credentials only the required bucket read/write operations; do not use root storage credentials in production. Configure an independent encrypted off-site copy. Generated PDF keys are company-scoped, content-addressed for issued documents and checksum-verified. Public bucket access is not required.

MinIO Community is archived and its verified October 2025 security release is supplied as a local source-build fixture only. Do not substitute a similarly named 2026 AIStor image without understanding its licensing. A maintained external S3-compatible endpoint is the production default decision. Self-hosted maintained storage on the same VPS can be substituted after an operations/security review; app/database/cache/proxy still run on one VPS.

Configure a real SMTP service, an authorized From address, SPF/DKIM/DMARC and TLS. Password reset links use `PUBLIC_APP_URL`; an incorrect URL breaks recovery. Mailpit is never a production mail service. Document outbox delivery is at-least-once.

## Environment

Create `.env.production` from the example with **new** secrets. Do not copy development passwords. Set permissions to 0600. Use URL-safe random strings for secrets embedded in connection URLs, or correctly percent-encode them when supplying a URL directly.

```text
NODE_ENV=production
COMPANY_SLUG=as-tino-dev
COMPANY_NAME="AS TINO DEV"
APP_DOMAIN=stock.your-domain.example
ACME_EMAIL=operations@your-domain.example
PUBLIC_APP_URL=https://stock.your-domain.example
API_ALLOWED_ORIGINS=https://stock.your-domain.example
POSTGRES_USER=as_tino_owner
POSTGRES_DB=as_tino_stock
POSTGRES_PASSWORD=<new random owner secret>
APP_DATABASE_PASSWORD=<different random runtime secret>
REDIS_PASSWORD=<new random secret>
ACCESS_TOKEN_SECRET=<at least 32 random bytes encoded as base64url>
COOKIE_SECRET=<different at least 32 random bytes encoded as base64url>
S3_ENDPOINT=<real private S3 endpoint URL>
S3_REGION=<provider region>
S3_BUCKET=<private bucket>
S3_ACCESS_KEY_ID=<scoped credential>
S3_SECRET_ACCESS_KEY=<scoped credential secret>
S3_FORCE_PATH_STYLE=<true or false according to provider>
SMTP_HOST=<provider host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=<provider user>
SMTP_PASSWORD=<provider secret>
SMTP_FROM="AS TINO Stock <stock@your-domain.example>"
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
PDF_DISABLE_SANDBOX=false
AUDIT_STORE_IP=false
SEED_ADMIN_EMAIL=<initial administrator email>
SEED_ADMIN_PASSWORD=<unique bootstrap password>
SEED_IDENTITY_ONLY=true
SWAGGER_ENABLED=false
APP_VERSION=<your tested release identifier>
```

Angle-bracket values above are documentation, not usable credentials. `TRUST_PROXY_HOPS` is fixed at 1 in this Compose configuration: only Caddy forwards API requests; Caddy overwrites forwarding headers. Never publish port 4000 or add an upstream CDN without revisiting this trust configuration. Both database passwords must be distinct. Migration/identity-bootstrap jobs intentionally use the owner account; the API uses `as_tino_app` without ownership or schema privileges.

`ACCESS_TOKEN_SECRET`, `COOKIE_SECRET` and SMTP/S3 credentials are supplied at runtime, never build arguments. The example uses an env file for a single-server deployment; a managed secret store is preferable when available. Keep backups of secrets separately encrypted. Rotating authentication secrets invalidates sessions/CSRF tokens; communicate the login requirement.

## Initial deployment

```sh
chmod 600 .env.production
# Define a convenience function in the project root; each command below uses this file.
dc() { docker compose --env-file .env.production -f docker-compose.production.yml "$@"; }
dc build api web
dc up -d --wait postgres redis
dc --profile tools run --rm migrate
# Grant only runtime data privileges, with immutable table restrictions.
dc exec -T postgres sh /opt/runtime-role.sh
dc --profile tools run --rm bootstrap
dc up -d --wait api web caddy
dc ps
```

Bootstrap creates identity, settings and the MAIN warehouse only; it does not load demo financial documents. After verifying login/reset, remove the bootstrap password from the long-lived environment and keep recovery procedures accessible. Future bootstrap runs do not overwrite existing passwords.

DNS must point to the VPS; allow incoming 80/443 and restricted administrator SSH only. Caddy requests/renews HTTPS certificates and redirects HTTP. Keep its data volume. Do not expose PostgreSQL, Redis, the API's internal port, SMTP administration or S3 administrative consoles publicly.

## Validate operation before live data

Verify `/api/v1/health/ready` through HTTPS, login as Admin and Worker, create a throwaway product/customer, check two competing last-unit withdrawals, confirm and cancel a delivery, issue a sample invoice, download PDF, record/cancel a payment, inspect audit and restore a backup into an isolated environment. Remove throwaway master records by archiving; keep traced history.

Health readiness probes database, Redis, object storage and the Chromium executable. **It does not prove that the browser sandbox launches or that every schema invariant is correct.** The actual PDF smoke test is mandatory. Never solve sandbox failures by running privileged containers. Configure the host's user-namespace/seccomp/AppArmor policy for the unprivileged Chromium user using the host vendor's current guidance; retain `PDF_DISABLE_SANDBOX=false` for production.

## Migrations, upgrades and rollback

Quiesce writes and take a verified database/object-storage backup before a release. Run reviewed migrations with the owner job, reapply `/opt/runtime-role.sh` so new tables receive the intended privileges, then deploy the matching API/web images. API runtime never runs schema migrations automatically. Review migration lock duration on realistic data.

PostgreSQL 18's image data volume is mounted at `/var/lib/postgresql`; the image manages its version-specific subdirectory. With PostgreSQL 17 use its appropriate path or explicitly set `PGDATA`. Never point a newer major binary directly at old-major database files. Use PostgreSQL's supported upgrade procedure or dump/restore.

Rollback application images only if the new schema remains compatible. Otherwise restore the coordinated database/object-store backup into a clean database and switch traffic after verification. Do not blindly delete volumes, reverse sequence counters or drop integrity triggers.

## Primary references checked for this continuation

- PostgreSQL official image documentation: https://github.com/docker-library/docs/blob/master/postgres/README.md (PG18 data directory/volume change).
- MinIO repository: https://github.com/minio/minio (community archive/support status).
- MinIO community security release: https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z.
- Caddy reverse proxy documentation: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy.

Recheck maintenance, licensing, vulnerabilities and package/container versions when actually releasing; this document is dated 10 September 2026.
