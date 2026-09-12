# QA report - AS TINO Stock continuation

Date: 10 September 2026. Source: the supplied `Gestion de stock.zip`.

## Release decision

**NOT APPROVED FOR PRODUCTION. The user's definition of done has not been met.**

The repository now contains implementation and test code across all six requested areas. That is not equivalent to passing their release gates. Package downloads were unavailable in this environment, pnpm and Docker were absent, and no PostgreSQL/Redis services or project dependency installation were available. The provided repository had no lockfile. A valid transitive lockfile could not be generated here and has not been fabricated.

The execution host used Node 22.16.0 and a globally available TypeScript compiler for the offline checks. The intended application toolchain is Node 24 with pnpm 10.28.2. Compatibility of the candidate framework pins remains unverified.

## Checks actually completed

| Check | Result | Evidence / boundary |
|---|---|---|
| Dependency-free domain tests | **15 passed, 0 failed, 0 skipped** | `qa/final-offline-tests.log`; the actual shared money, stock, permission and status modules are strictly compiled, then exercised with Node's test runner. |
| Source syntax | **152 TypeScript/TSX files; 0 syntax errors** | `qa/final-syntax.log`; transpilation diagnostics only, not dependency-aware type checking. |
| Relative source imports | No missing local targets found | `qa/local-imports.json`; does not validate package exports or external dependencies. |
| YAML | Four files parsed | Local and production Compose, GitHub Actions, workspace configuration; parser success is not Docker validation. |
| Package JSON | Parsed | This does not resolve versions, peers or native binaries. |
| POSIX shell syntax | Three scripts passed `sh -n` | Backup, restore and database runtime-role provisioning; none was executed against a database. |
| Schema/migration text inventory | 29 models matched 29 created tables | `qa/migration-structure.json`; not Prisma validation, migration execution, constraint verification or schema drift detection. |
| PDF template rendering | Four finished PDFs, seven A4 pages | Quote, invoice and delivery note: one page each; long invoice: four pages. Chromium rendered the real HTML template with synthetic SPECIMEN fixtures. |
| PDF visual review | All seven pages inspected | No visible clipping, overlapping table text or lost footer in these fixtures; `qa/pdf-render-checks.json` records page sizes and footer presence. |
| Private environment-file check | No private `.env` files included | `qa/secret-file-scan.json`; a filename/configuration check, not a professional secret scan. |

The 15 offline tests cover exact millime arithmetic, multiple lines and tax rates, line/document discounts and allocation, rounding, numeric bounds, stock validation/reversal arithmetic, permissions, status transitions, payment balance and derived overdue state. They do **not** establish database locking, HTTP authentication, real browser behavior or deployment correctness.

## Required checks that did not run successfully

| Required gate | Actual status |
|---|---|
| `pnpm install` / dependency resolution | **Blocked**: package downloads and pnpm unavailable; no lockfile. |
| `pnpm lint` | **Blocked**, not passed. |
| `pnpm typecheck` | **Blocked**, not passed. |
| `pnpm test:unit` | **Blocked** for the full Vitest suites; the separate offline results above are narrower. |
| `pnpm db:validate`, generate and deploy | **Blocked**; schema and both migrations have not been validated/executed by Prisma/PostgreSQL here. |
| `pnpm test:integration` | **Blocked**; 26 HTTP/database integration tests were written, not executed. |
| `pnpm test:e2e` | **Blocked**; 4 Playwright workflow groups were written, not executed. |
| `pnpm build` | **Blocked**; no verified Next.js or NestJS production build. |
| Docker build/config/health | **Blocked**; YAML parsing is not an image build or running health check. |
| Seed rerun/idempotency | Implemented, but **not executed** against a live database here. |
| Live PDF/API/S3 round trip | Integration test written, **not executed**. Template rendering alone is not this test. |
| Backup/restore exercise | Scripts provided, **not executed**. |
| Web accessibility / real camera | UI accessibility measures implemented; **no browser, assistive-technology or hardware acceptance pass**. |

`qa/final.json` and its command logs record the blocked pnpm outcomes. Phase logs preserve attempted lint/type/unit gates throughout implementation. No core test was deliberately skipped or configured to accept an empty suite. Source development continued with the narrower checks; no phase with blocked gates is certified complete.

## High-priority verification risks

1. Resolve the real dependency graph under strict peer checking, then review and commit the resulting `pnpm-lock.yaml`. Current pins are candidates, not a verified latest-compatible stack.
2. Validate Prisma 7 configuration, driver adapter and generated types. The first migration was generated using a local schema parser, **not** Prisma's migration generator. Execute both migrations on an empty disposable PostgreSQL 18 database and compare the resulting schema to Prisma's expected schema.
3. Exercise the SQL-only immutability, deferred total/ledger checks and tenant-reference constraints. Do not replace them with `prisma db push`. Test the non-owner API database role and reapply its grants after migrations.
4. Run the existing concurrency, idempotency/replay, double-payment, delivery rollback and reversal tests against real services. Test session rotation across multiple tabs and deactivation of an already logged-in user.
5. Run the full production build and browser tests. Check browser/PWA behavior, French forms, mobile keyboard navigation, table overflow and scanner camera permission on the actual devices.
6. Verify Chromium sandbox operation inside the intended production container, private S3 access, SMTP/outbox retries, HTTPS proxy headers and a real backup restoration.

## Deliberate v1 boundaries and remaining product gaps

Full-document conversions only; no partial deliveries/invoices, supplier/purchase-order module, reservations, lot/serial/expiry tracking, bank gateway or public customer portal. Cancellation and traceable payment reversal are implemented, but there is no standalone statutory credit-note module. Accountant approval of cancellation/tax/numbering treatment is mandatory before real use.

The issued original PDF retains its issue-time customer/company/payment snapshot; live payment status is shown separately. A visual document-template designer and a second interface language are not included. Generic sorting/filtering is not exposed for every field in every module. Clearing certain optional product fields to null requires a follow-up API/form refinement; ordinary value updates are implemented. Company selection is deployment-based, not a tenant onboarding portal.

Private screens and stock mutations are not supported offline. Camera decoding needs a real-device acceptance test. Document mail uses at-least-once delivery; PDF rendering has bounded in-process concurrency rather than a BullMQ worker. None of these implementation choices should be confused with a passed production acceptance test.

## How to close the release gate

Follow `README.md` on a network-enabled Node 24 machine. Resolve dependencies, validate/generate/deploy migrations, seed a disposable database, and run lint, type checking, all tests and production/container builds without suppressing failures. Record real results. Complete the operational and accountant checks before importing production data. `docs/continuation.md` provides the next-engineer checklist.
