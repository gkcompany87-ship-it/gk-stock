# AS TINO Stock

**AS TINO DEV - inventory and commercial management.** French interface, `fr-TN`, Tunisian dinar (`TND`, three decimal places), `Africa/Tunis`.

## Delivery status - 10 September 2026

This is a continuation of the supplied `Gestion de stock.zip`, not a replacement mockup. Existing Nest modules, schema and useful frontend components were preserved and extended. No remote repository was modified.

**Release candidate source code, NOT a verified production release.** The environment used for this delivery cannot download project dependencies and has no pnpm, Docker, PostgreSQL or Redis. There was no lockfile in the upload. Consequently a dependency lockfile could not be resolved, and full lint/type checks, Prisma validation/migrations, integration/E2E tests, framework builds and container health checks have **not passed here**. CI deliberately fails until a reviewed lockfile is committed. The 15 dependency-free domain tests did run and pass; real PDF templates were rendered with Chromium. See [QA report](docs/qa-report.md) and [next engineer handover](docs/continuation.md).

Do not expose this application to real customers or import real financial data until every release gate below passes. A Tunisian accountant must validate the fiscal configuration and document content; this repository does not assert legal compliance.

## Implemented areas

The API and interface cover products, categories, warehouses, exact stock balances, entries/withdrawals, scanner/manual lookup, corrections through compensating movements, worker mistake reports, customers/timelines, quotes, invoices, delivery notes, payments/cancellations, PDF generation/storage, CSV reports, dashboards, user/role management, audit and company settings.

Issued commercial documents carry frozen company/customer/line snapshots. Confirmed deliveries deduct stock transactionally; cancellation reverses movements. Workers receive neither financial product fields nor other workers' histories. UI access checks are convenience only: the API checks permissions, ownership and tenant relationships again.

## Architecture

```text
Browser / mobile PWA
        | same-origin HTTPS
      Caddy
        |-- /api/* --> NestJS + Fastify modular monolith
        |                   |-- PostgreSQL + Prisma / row locks
        |                   |-- Redis (authentication throttling)
        |                   |-- S3-compatible private storage
        |                   |-- Chromium (bounded PDF generation)
        |                   `-- SMTP / transactional document-mail outbox
        `-- /* ------> Next.js App Router
```

Workspaces: `apps/web`, `apps/api`, `packages/shared`, `packages/ui`, `packages/database`, `packages/config`. No Kafka/Kubernetes/microservice split. BullMQ is deliberately not added: a transactional PostgreSQL outbox handles document email retries, and on-demand PDF rendering has bounded concurrency.

Candidate framework pins are in `pnpm-workspace.yaml`: Next 16.3.4, React 19.2.8, Nest 12.0.1, Prisma 7.10.0; Node 24 and pnpm 10.28.2 are the targeted tools. These are **not yet a proven mutually compatible dependency resolution**. Strict peer checking is enabled. Exact transitive versions must be resolved and reviewed before a release. TanStack Table remains on the existing v8 API rather than silently migrating to v9.

## Requirements

Node.js 24, pnpm 10.28.2, either native services (see below) or Docker Engine/Desktop with Compose v2, internet access for the first dependency/image/browser download, and available localhost ports 3000, 4000, 5432, 5433 (tests), 6379, 9000, 9001, 1025 and 8025. The Linux `/usr/bin/chromium` default must be replaced on macOS; the helper below does that automatically.

The local MinIO container builds the verified community security release from source. The upstream community repository is archived; this is a **development fixture**, not a production support promise. Production uses a separately maintained S3-compatible service. See [deployment](docs/deployment.md).

## macOS without Docker (native development)

Use [the native macOS guide](docs/native-macos.md) instead of the Docker steps below.
This path uses Homebrew PostgreSQL 18 and Redis, local Mailpit, and a **development-only**
private filesystem storage adapter. Production continues to require S3. No existing
Docker database or S3 files are automatically migrated. Keep `.env` and local data private.

The no-Docker patch corrects `@nestjs/config` from the nonexistent 5.x range to 12.0.0,
and `typescript-eslint` from 9.x to 8.70.0 (compatible peer ranges for ESLint 10 and
TypeScript 5.9). This is not a certification of the remaining dependency graph.
See [patch validation](docs/native-patch-qa.md).

## First local installation (Docker option)

Run these commands in the extracted project directory. These commands are the documented intended setup, not commands already verified end-to-end in this delivery environment.

```sh
npm install --global pnpm@10.28.2
pnpm setup:env

# One-time bootstrap ONLY: the upload had no lockfile and none could be resolved here.
# Resolve peer conflicts if reported; do not disable strict peer checks.
pnpm install --no-frozen-lockfile
# Review the resulting dependency changes and commit pnpm-lock.yaml.
# Every subsequent installation and CI/deployment must use:
pnpm install --frozen-lockfile

pnpm exec playwright install chromium
node scripts/configure-chromium.mjs
# On a supported Linux host, browser system libraries may also be required:
# pnpm exec playwright install --with-deps chromium

docker compose up -d --build --wait postgres redis minio mailpit
docker compose run --rm storage-init
pnpm db:validate
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm demo:credentials
pnpm dev
```

`setup:env` writes a mode-0600 `.env` with unique random local secrets and refuses to overwrite an existing file. Do not paste it into chat, commit it or send it to a client. No fixed demo password is committed. `demo:credentials` prints the values from your local file; it does not retrieve or change stored passwords.

The seed creates one company, Admin, Worker, a default `MAIN` warehouse, several categories, 15 products covering normal/low/zero stock, sample customers, quote/invoice/delivery/payment data and traced stock movements. It is idempotent and does not reset existing balances, sequences or passwords. A previous seed retains the original passwords even if `.env` is subsequently edited; use the reset flow to change an existing user's password. Production demo seeding is refused; use identity-only bootstrap.

## Application routes

| Route | Purpose |
|---|---|
| `/connexion` | Login |
| `/` | Role-specific dashboard |
| `/scanner` | Camera or manual-code withdrawal |
| `/produits`, `/mouvements` | Inventory and traced operations |
| `/clients` | Customers and timeline |
| `/devis`, `/factures`, `/bons-de-livraison` | Commercial workflows |
| `/paiements`, `/rapports` | Payments and reports |
| `/utilisateurs`, `/journal-audit`, `/parametres` | Administration |
| `/mot-de-passe-oublie`, `/reinitialiser-mot-de-passe` | Password reset |
| `http://localhost:4000/api/docs` | Development OpenAPI UI |
| `http://localhost:4000/api/v1/health/ready` | API dependency readiness |
| `http://localhost:8025` | Local Mailpit inbox |

Open `http://localhost:3000`. Camera access requires a secure browser context (localhost or HTTPS); use manual input otherwise. The PWA never queues inventory writes offline or caches authenticated API/PDF data.

## Development, tests and release gates

```sh
pnpm doctor
pnpm db:validate
pnpm db:generate
pnpm build
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:offline

# Isolated integration and browser database; never point tests to live data.
docker compose --profile test up -d --build --wait postgres-test redis minio mailpit
docker compose run --rm storage-init
pnpm test:integration
pnpm test:e2e:prepare
pnpm test:e2e

# Development only: create a new schema migration after changing schema.prisma.
pnpm db:migrate --name descriptive_change
# Production/staging apply only reviewed migration files:
pnpm db:deploy
pnpm db:status
```

`TEST_DATABASE_URL` must point to a database whose name ends in `_test`; the runner fails otherwise. Integration tests use real PostgreSQL, Redis, S3 and Chromium, not mocked stock services. E2E runs against separately seeded test data on ports 3100/4100; it does not reuse an arbitrary running server. Tests retain their test data for diagnostics and use unique test names. Clear only the disposable test volume manually when required.

For deterministic release checks use the committed lockfile, fresh databases, the intended Node version and a clean build cache. `node scripts/quality-gates.mjs final` records actual command statuses under `docs/qa/` and returns nonzero for failure or unavailable tools. No core test is marked skipped.

## Production

Read [deployment](docs/deployment.md) before starting the production Compose file. It requires a real domain, new secrets, a private S3 bucket, SMTP, a reviewed dependency lock and successful QA. The API runs as an unprivileged OS user and with a separate non-owner PostgreSQL role. Migration/bootstrap jobs use the owner account separately. Only Caddy publishes ports. Chromium sandbox operation and PDF creation must be tested on the target VPS.

Do not use `prisma db push` against this schema: SQL-only triggers are part of inventory and document integrity. Do not change a PostgreSQL 17 volume to an 18 image without a supported upgrade or dump/restore.

## Documentation

[Architecture and ERD](docs/architecture.md) · [Permissions](docs/permissions.md) · [API](docs/api.md) · [French user guide](docs/user-guide-fr.md) · [Deployment](docs/deployment.md) · [Backup/restore](docs/backup-and-restore.md) · [Security](docs/security.md) · [QA](docs/qa-report.md) · [Handover](docs/continuation.md) · [Changed files](docs/changes.md).
