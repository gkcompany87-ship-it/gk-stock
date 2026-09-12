# AS TINO Stock - implementation continuation report

**Delivery date:** 10 September 2026  
**Release status:** source implementation delivered; production acceptance is blocked and not certified.

## 1. What was built

This work continues the supplied `Gestion de stock.zip`; it is not a replacement mockup. The uploaded baseline contained 126 source/configuration files, partial Nest/Next implementation and no README, lockfile or migration directory. There was no useful commit/checkpoint proving the exact stopping point of a remote Codex session. The uploaded source, not an assumed remote repository, was the starting point; no remote repository was changed.

The repository now includes French role-specific dashboards, authentication and password reset, product/category/warehouse management, scanner/manual lookup, atomic stock operations, traceable reversals, worker mistake reports, customer timelines, quotes, invoices, delivery notes, payments, PDF templates/storage, reports/CSV, user/permission management, audit and company settings.

Important inherited defects addressed in code include incorrectly weighted document tax totals, refresh-token lookup limited to the newest 50 sessions, worker access to other workers' movements, financial fields in worker product responses, payment/reversal races, unsafe retry idempotency, live-data PDF snapshots and a destructive development seed. Only the narrow domain tests and static/PDF checks below were executable here; HTTP/database fixes still need their integration gates.

## 2. Architecture and technology choices

A pnpm/Turborepo modular monolith separates `apps/web`, `apps/api` and shared UI, configuration, database and domain packages. The candidate stack is Next.js 16/React, NestJS 12/Fastify, Prisma 7/PostgreSQL 18, Redis, S3, Chromium and Caddy. Exact pins are recorded in `pnpm-workspace.yaml`; mutual compatibility has not been established by installation/build.

REST routes use `/api/v1`; OpenAPI documentation is included. PostgreSQL transactions and row locks protect stock, numbering, delivery and payment operations. Decimal strings at API boundaries and BigInt scaled arithmetic avoid floating-point money calculations. SQL-only safeguards complement API checks. Argon2id, session-bound short JWTs, rotating refresh families, CSRF, Redis throttling, explicit service authorization and immutable audit are implemented.

There is no unnecessary microservice split. Redis is used for authentication throttling; a transactional PostgreSQL outbox handles document email. PDF rendering is on-demand with bounded concurrency rather than a separate BullMQ service. Production expects maintained private S3-compatible storage; local Compose provides a development object-storage fixture.

## 3. Exact intended local run commands

Use a network-enabled machine with Node 24 and Docker Compose v2. The following are documented setup commands, **not a claim that end-to-end startup has passed here**.

```sh
cd as-tino-stock
npm install --global pnpm@10.28.2
pnpm setup:env

# Once only: resolve the missing lockfile, keep strict peer checking,
# fix reported incompatibilities and review/commit pnpm-lock.yaml.
pnpm install --no-frozen-lockfile
pnpm install --frozen-lockfile

pnpm exec playwright install chromium
node scripts/configure-chromium.mjs
docker compose up -d --build --wait postgres redis minio mailpit
docker compose run --rm storage-init
pnpm db:validate
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm demo:credentials
pnpm dev
```

Open `http://localhost:3000`; development API documentation is at `http://localhost:4000/api/docs`. On Linux, Playwright system libraries may also need `pnpm exec playwright install --with-deps chromium`. Read `README.md` for test services and `docs/deployment.md` before any production launch.

## 4. Test results

15 offline domain tests passed, none failed or skipped. 152 TypeScript/TSX files passed syntax-only diagnostics. Relative local import checks, workspace JSON and four YAML files parsed successfully; three operational shell scripts passed syntax checks. Four real HTML PDF templates/fixtures rendered to seven A4 pages and were visually inspected.

The full Vitest suites, HTTP/PostgreSQL integration suite and Playwright browser suite were written but could not run. Authentication, concurrency, seed behavior and role restrictions are therefore **not runtime-certified**. See `docs/qa-report.md` and `docs/qa/` for the exact evidence and boundaries.

## 5. Build results

Full lint, dependency-aware type checking, Prisma validation/migration execution, Next/Nest production builds, Docker image builds, container health and backup restore were **blocked**, not passed. Project dependencies, pnpm, Docker and the database services were unavailable; package downloads were blocked. No lockfile was fabricated. CI and Docker intentionally require a real reviewed frozen lockfile before they can pass.

## 6. Demo credentials

`pnpm setup:env` creates a local mode-0600 `.env` with random credentials and refuses to overwrite it. Seed values are controlled by `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_WORKER_EMAIL` and `SEED_WORKER_PASSWORD`. Display your local values with `pnpm demo:credentials`. No real or fixed production password is shipped.

The seed includes one AS TINO DEV Demo company, Admin, Worker, a default warehouse, several categories, 15 realistic products (normal/low/zero quantities), sample customers, documents, payments and movements. Reruns are designed not to reset stock, numbering or existing passwords; this behavior still needs the real-database test. Changing `.env` after a user exists does not reset that user's password.

## 7. Known limitations

Production acceptance is incomplete. Dependency compatibility, handwritten/generated SQL migrations, runtime database grants, framework typing, browser flows, Chromium sandbox and real integrations require successful gates. Financial content is not asserted to be legally compliant; the client's Tunisian accountant must approve it.

V1 uses full-document conversions and controlled cancellations, not partial fulfilment or a statutory credit-note module. Issued PDF bytes preserve their original snapshot; payments afterward are visible in application history. There is no visual template designer, bank gateway, public portal, second language or offline stock-write queue. Not all possible report filters/sorts are exposed, and clearing certain optional product fields to null needs further refinement. See the QA and continuation documents for the full list.

## 8. Recommended next improvements

First close the existing gates rather than add features: resolve the lock, validate migrations and integrity triggers, fix all lint/type/build/test failures and run the production containers. Then prioritize a real-device/assistive-technology review, restore drill, accountant-approved credit-note workflow and any required partial-delivery model. Move PDF rendering into a BullMQ worker only when measured workload warrants it.

## 9. Created and modified files

`docs/changes.md` contains the complete created/modified/unchanged/removed path inventory relative to the uploaded archive. `docs/change-manifest.json` includes SHA-256 checksums. `docs/file-manifest.json` preserves the original baseline. Generated dependencies, local compilation artifacts, private environment files and Git internals are excluded from the delivered archive.

Required documentation is included: README, architecture/ERD, permissions, API, deployment, backup/restore and French user guide. Additional security, environment, QA and continuation documents support handover.

## 10. Actions still required

Resolve and commit the dependency lock on a network-enabled Node 24 host; validate and deploy both migrations to a disposable PostgreSQL 18 database; run seed and all quality/build/container gates; fix actual failures without skipping tests. Configure the real company, domain/HTTPS, SMTP, S3 and fresh secrets; test backup restoration and obtain accountant approval. Only then approve production deployment.

The original ZIP was left untouched. This delivery does not claim to satisfy the definition of done until the outstanding checks and product decisions are closed.
