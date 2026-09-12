# Native macOS patch validation - 10 September 2026

This patch addresses the reported install failure and adds a Docker-free development path.
It is **not a production approval or a full application startup certification**.

## Changes

- Corrected the unpublished `@nestjs/config` 5.x range to 12.0.0, verified against its
  upstream release and Nest 11/12 peer declaration.
- Corrected root `typescript-eslint` 9.x to 8.70.0. Its upstream peer declaration accepts
  ESLint 10 and TypeScript 5.9. Remaining dependency pins are not certified by installation.
- Added a development/test-only local object adapter. Production rejects it and still uses S3.
- Added native environment, PostgreSQL bootstrap, Mailpit and prerequisite-check commands.
- Preserved generated passwords; environment changes make a private backup first.
- Kept test database, Redis and filesystem storage isolated from development data.
- Fixed AGENTS.md's broken reference to the existing QA report.

## Executed successfully in the supplied Linux environment

- 16 new native-support tests passed; 0 failed, skipped or cancelled.
- 15 existing offline domain tests passed; 0 failed, skipped or cancelled.
- Syntax diagnostics for 153 TypeScript/TSX files: 0 errors (not full type checking).
- The new local-object-store.ts passed a standalone strict TypeScript check against
  the installed Node type definitions. This does not typecheck Nest/Prisma integration.
- Node syntax checks passed for the new/changed native scripts.

The new tests cover private object round-trip, first-write-wins behavior, 16 competing
writers publishing complete bytes, path containment, symlink rejection, test isolation,
production refusal, invalid database configuration and preservation of generated secrets.
These tests use real local filesystem operations, not a fake implementation of the adapter.

## Not executed successfully / still blocked

`pnpm lint`, `pnpm typecheck`, the full `pnpm test:unit`, and `pnpm build` were attempted,
but pnpm was unavailable. The host runs Node 22.16.0 rather than the project's target Node 24.
Registry DNS/network access was unavailable, so dependency installation and generation of
a real lockfile remain blocked. No lockfile is invented or supplied.

No live PostgreSQL, Redis, Mailpit, macOS/Homebrew, Next/Nest HTTP integration, real S3,
browser E2E or production deployment was validated here. Native tests cannot certify S3
behavior. Run the entire documented acceptance suite on the user's machine before real use.

Existing Docker or S3 data is not migrated automatically. Keep `.env` backups, original
object storage and any existing database intact until a deliberate migration is verified.
