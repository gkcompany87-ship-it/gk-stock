#!/bin/sh
# Run as the database owner, after migrations. Never interpolate secrets into SQL text.
set -eu
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${APP_DATABASE_PASSWORD:?}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
 --set=app_password="$APP_DATABASE_PASSWORD" --set=owner="$POSTGRES_USER" <<'SQL'
SELECT format('CREATE ROLE as_tino_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'as_tino_app') \gexec
SELECT format('ALTER ROLE as_tino_app PASSWORD %L', :'app_password') \gexec
GRANT USAGE ON SCHEMA public TO as_tino_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO as_tino_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO as_tino_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM as_tino_app;
REVOKE UPDATE, DELETE ON TABLE "AuditLog", "StockMovement", "IdempotencyRecord", "FileAsset" FROM as_tino_app;
REVOKE DELETE ON TABLE "Quote", "Invoice", "DeliveryNote", "Payment", "StockBalance" FROM as_tino_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO as_tino_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO as_tino_app;
SQL
