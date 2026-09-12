# Continuation plan - 10 September 2026

## Repository actually received
The uploaded archive contains 126 source/configuration files (the precise inventory is in `docs/file-manifest.json`), an empty Git history, partial Next.js screens, a NestJS modular monolith, a Prisma schema and four shared unit-test files. There is no README, AGENTS file, lockfile, migration directory, API integration suite or browser suite. No remote repository was modified.

## Important problems found before editing
1. The document tax calculation weights each line's tax by its share of the document instead of adding line taxes. Header and line totals can disagree.
2. Refresh tokens are checked against only the last 50 sessions globally; rotation is not atomic and the access token is not bound to a revocable device session.
3. Authentication throttling is configured but no throttling guard is registered. Public refresh requests bypass CSRF checks, as does any Authorization header.
4. Workers can request another user's movements. Product responses include purchase prices. Service-level permission/tenant checks are incomplete.
5. Payment read/update is not locked. Concurrent payments can overpay an invoice. Reversals lack a unique constraint and a locked source record.
6. Reusing a stock idempotency key with different input returns an unrelated prior movement. The scanner creates a fresh key on every retry.
7. Quotes and delivery notes cannot be cancelled; invoices have no controlled cancellation. Conversion retries create duplicate documents.
8. PDFs exist only for invoices and use live company/customer information. Chromium is not installed by the API Dockerfile.
9. Prisma 7 needs explicit configuration and the PostgreSQL driver adapter. TypeScript source aliases cross package root directories. The API's tsx runner does not emit the decorator metadata relied on by Nest injection.
10. Login, document, payment, user, settings and audit pages are missing. Reports count only truncated subsets. Several package scripts accept an empty test suite.
11. The seed rewinds numbering, overwrites stock balances and duplicates audit entries on repeated runs.
12. Production assets, readiness checks, secret validation, object-bucket provisioning and operating documentation are incomplete.

## Ordered work
1. **Foundation:** preserve modules; repair workspace/package configuration; configure Prisma 7; add reviewed migrations, environment bootstrap and Compose services.
2. **Identity:** session-selector tokens, atomic rotation and replay revocation; CSRF on public mutations; Redis throttling; real reset-mail transport; service permission checks and immutable audit foundation.
3. **Inventory:** exact quantities, tenant validation, row locking, durable idempotency, reversals, incident reporting, worker-only history and safe scanning.
4. **Commercial:** exact millime calculations; locked issuance/numbering/payments; draft editing; immutable issue snapshots; cancellation and full-document conversions.
5. **Documents/reporting:** immutable PDF archive, S3 images, mail outbox, database reports, CSV safety, complete French administration screens.
6. **Readiness:** test suites, security/accessibility checks, Docker deployment, backups, documentation and an explicit validation report.

## Decisions
- One company is selected by `COMPANY_SLUG`; users cannot self-select another tenant after authentication. The database is tenant-scoped and supports multiple warehouses.
- Amounts and quantities cross the API as decimal **strings**. Calculations use integer millimes and integer thousandths via BigInt, not binary floating-point arithmetic.
- v1 conversions are full-document, one invoice and one delivery note per source quotation; no partial invoicing/fulfilment.
- Issued PDFs show the immutable issue-time snapshot. Later payments and cancellation remain visible separately; an issued PDF is never rewritten with live master data.
- SMTP is used for password reset. Mailpit is development-only. Document mail uses a durable transactional outbox with bounded retries.
- No offline stock writes and no cached private API/document responses.
- Legal/tax approval remains with the client's Tunisian accountant.

## Validation constraints
This execution environment has Node 22.16, a global TypeScript compiler, but no pnpm, Docker daemon, PostgreSQL/Redis server or project dependencies. Direct registry DNS resolution and the download helper both failed. Full package installation, dependency resolution/lockfile generation, framework type-checks, database concurrency tests, production builds and Docker health checks must not be reported as passed here. Dependency-free domain tests and source validation will be executed; the remaining commands and their actual outcomes are recorded separately. Phases with blocked gates are not certified complete.
