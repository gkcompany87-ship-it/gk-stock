# Environment reference

The checked-in `.env.example` contains no secret values. `setup:env` generates local secrets, not production credentials. This table lists the actual supported configuration. Production URL/proxy/storage decisions are in deployment.md.

| Variable | Example/default | Secret/configuration note |
|---|---|---|
| `NODE_ENV` | `development` | See `.env.example` comments and deployment.md. |
| `APP_NAME` | `"AS TINO Stock"` | See `.env.example` comments and deployment.md. |
| `COMPANY_SLUG` | `as-tino-dev-demo` | See `.env.example` comments and deployment.md. |
| `PUBLIC_APP_URL` | `http://localhost:3000` | See `.env.example` comments and deployment.md. |
| `API_PORT` | `4000` | See `.env.example` comments and deployment.md. |
| `API_HOST` | `0.0.0.0` | See `.env.example` comments and deployment.md. |
| `API_ALLOWED_ORIGINS` | `http://localhost:3000` | See `.env.example` comments and deployment.md. |
| `API_INTERNAL_URL` | `http://localhost:4000` | See `.env.example` comments and deployment.md. |
| `NEXT_PUBLIC_API_URL` | `/api/v1` | See `.env.example` comments and deployment.md. |
| `TRUST_PROXY_HOPS` | `0` | See `.env.example` comments and deployment.md. |
| `SWAGGER_ENABLED` | `true` | See `.env.example` comments and deployment.md. |
| `ACCESS_TOKEN_SECRET` | `(empty)` | Keep private; set explicitly. |
| `COOKIE_SECRET` | `(empty)` | Keep private; set explicitly. |
| `AUDIT_STORE_IP` | `false` | See `.env.example` comments and deployment.md. |
| `DATABASE_URL` | `(empty)` | Keep private; set explicitly. |
| `POSTGRES_USER` | `as_tino` | See `.env.example` comments and deployment.md. |
| `POSTGRES_PASSWORD` | `(empty)` | Keep private; set explicitly. |
| `POSTGRES_DB` | `as_tino_stock` | See `.env.example` comments and deployment.md. |
| `REDIS_URL` | `redis://localhost:6379` | See `.env.example` comments and deployment.md. |
| `S3_ENDPOINT` | `http://localhost:9000` | See `.env.example` comments and deployment.md. |
| `S3_REGION` | `us-east-1` | See `.env.example` comments and deployment.md. |
| `S3_BUCKET` | `as-tino-stock` | See `.env.example` comments and deployment.md. |
| `S3_ACCESS_KEY_ID` | `as-tino-local` | See `.env.example` comments and deployment.md. |
| `S3_SECRET_ACCESS_KEY` | `(empty)` | Keep private; set explicitly. |
| `S3_FORCE_PATH_STYLE` | `true` | See `.env.example` comments and deployment.md. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | `/usr/bin/chromium` | See `.env.example` comments and deployment.md. |
| `PDF_DISABLE_SANDBOX` | `false` | See `.env.example` comments and deployment.md. |
| `SMTP_HOST` | `localhost` | See `.env.example` comments and deployment.md. |
| `SMTP_PORT` | `1025` | See `.env.example` comments and deployment.md. |
| `SMTP_SECURE` | `false` | See `.env.example` comments and deployment.md. |
| `SMTP_REQUIRE_TLS` | `false` | See `.env.example` comments and deployment.md. |
| `SMTP_USER` | `(empty)` | See `.env.example` comments and deployment.md. |
| `SMTP_PASSWORD` | `(empty)` | Keep private; set explicitly. |
| `SMTP_FROM` | `"AS TINO Stock <stock@astino.example>"` | See `.env.example` comments and deployment.md. |
| `SEED_ADMIN_EMAIL` | `admin@astino.example` | See `.env.example` comments and deployment.md. |
| `SEED_ADMIN_PASSWORD` | `(empty)` | Keep private; set explicitly. |
| `SEED_WORKER_EMAIL` | `worker@astino.example` | See `.env.example` comments and deployment.md. |
| `SEED_WORKER_PASSWORD` | `(empty)` | Keep private; set explicitly. |
| `APP_DOMAIN` | `stock.example.com` | See `.env.example` comments and deployment.md. |
| `ACME_EMAIL` | `admin@example.com` | See `.env.example` comments and deployment.md. |
| `BACKUP_RETENTION_DAYS` | `14` | See `.env.example` comments and deployment.md. |
| `TEST_DATABASE_URL` | `(empty)` | Keep private; set explicitly. |
| `TEST_REDIS_URL` | `redis://localhost:6379/1` | See `.env.example` comments and deployment.md. |
| `TEST_S3_BUCKET` | `as-tino-stock-test` | See `.env.example` comments and deployment.md. |
| `APP_DATABASE_PASSWORD` | `(empty)` | Keep private; set explicitly. |
| `REDIS_PASSWORD` | `(empty)` | Keep private; set explicitly. |
| `SEED_IDENTITY_ONLY` | `false` | See `.env.example` comments and deployment.md. |
| `COMPANY_NAME` | `"AS TINO DEV"` | See `.env.example` comments and deployment.md. |
| `APP_VERSION` | `local` | See `.env.example` comments and deployment.md. |

Only `API_INTERNAL_URL` is used to configure Next rewrites at build time. Public API paths remain same-origin. Never prefix a private secret with `NEXT_PUBLIC_`. The Compose production file supplies connection URLs inside its private network; your local `.env` uses localhost ports. Changing PostgreSQL image environment variables does not change passwords in an already initialized database.
