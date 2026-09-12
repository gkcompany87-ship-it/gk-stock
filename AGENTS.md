# AS TINO Stock engineering rules
Read README.md, docs/architecture.md and docs/qa-report.md before editing.
Keep this a pnpm/Turbo modular monolith. Never use floats for money or stock calculations.
All state-changing stock/document/payment operations need service authorization, company scoping, transactions, durable idempotency and audit events in the same transaction.
Never edit/delete ledger or audit rows. Never rebuild issued documents from current product/customer/company data.
Never commit .env files, passwords, reset links, tokens, generated private PDFs or uploads.
Run pnpm lint, pnpm typecheck, pnpm test:unit after each phase. Run integration/e2e and production build before calling work production-ready. Do not skip tests or fabricate a lockfile.
