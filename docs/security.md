# Security design and outstanding verification

Passwords use Argon2id with explicit memory/time parameters. No password or production secret is in source. Access JWTs are short-lived and tied to a revocable device family. Refresh values use a selector + secret, with a stored SHA-256 hash of a high-entropy random secret. Rotation and replay-family revocation are transactional; a family replay invalidates the current family as well. Revocation is checked on API access, not deferred until JWT expiry.

Production cookies are `__Host-` prefixed, Secure, HTTP-only, SameSite=Lax, Path=/ and omit Domain. Cookie-authenticated mutations, including login/refresh/reset requests, require allowed Origin plus a signed CSRF token from `/auth/csrf`. The client serializes refresh and cookie mutations across tabs using Web Locks where supported. Browsers without Web Locks have only same-tab fallback serialization and require concurrency testing.

Auth POST endpoints are Redis-rate-limited and fail closed when that counter service is unavailable. Login lockout is persisted and temporary. Password reset is single-use/expiring, stores only a hash, gives a non-enumerating HTTP response and delivers its token through SMTP. Reset fragments are removed from browser history by the page. No reset link is exposed in JSON or ordinary logs.

All resources are company-scoped, and workers' history/financial fields are constrained again in service code. Zod strict objects reject mass assignment, SQL uses parameters, HTML/PDF values are escaped, and private API errors omit internal query/stack data. Raster image uploads are size-limited, decoded and re-encoded; SVG/HTML uploads are not treated as safe product images. PDF pages block external requests and scripts to limit SSRF. File ids are resolved against the authenticated company.

Audit rows are append-only, omit secret fields and have bounded safe summaries. Request ids are server-generated. IP auditing defaults off; enable only with appropriate notice, legal basis, retention and trusted-proxy configuration. Audit immutability does not eliminate privacy obligations. Operational database administrators remain powerful and require access controls/backups.

The frontend uses a CSP nonce, visible focus states, semantic labels/dialogs and server authorization. The interface has not been browser-accessibility-tested in this environment. HTML template rendering is not proof of application WCAG conformance.

## Required before production

Pass the security unit/integration/E2E suites with the resolved dependencies. Review dependency vulnerabilities and image digests, penetration-test authentication/authorization/CSRF, run two-tab refresh tests on target browsers, test camera permission and keyboard/screen reader navigation, verify user-namespace browser sandboxing, verify the database runtime role cannot update/delete/truncate audit/stock history or modify the schema, and exercise backup recovery. Confirm S3 bucket policies, SMTP TLS, HTTPS redirects and exposed ports.

Do not use the permissive development Redis endpoint, development object-store root credentials, local Mailpit or `PDF_DISABLE_SANDBOX=true` in production. The disposable CI runner may disable Chromium sandboxing explicitly; that is not a production configuration recommendation.
