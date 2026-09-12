#!/bin/sh
set -eu
: "${PGHOST:?Set PGHOST}" "${PGUSER:?Set PGUSER}" "${PGDATABASE:?Set empty target database}"
: "${CONFIRM_RESTORE_DATABASE:?Set CONFIRM_RESTORE_DATABASE to the exact target database name}"
[ "$CONFIRM_RESTORE_DATABASE" = "$PGDATABASE" ] || { echo 'Confirmation does not match target database.' >&2; exit 1; }
[ "$#" -eq 1 ] && [ -f "$1" ] || { echo 'Usage: restore-postgres.sh backup.dump' >&2; exit 1; }
count=$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
[ "$count" = 0 ] || { echo 'Target is not empty. Refusing destructive restore.' >&2; exit 1; }
# A full restore loads data before triggers, then recreates constraints/indexes.
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$PGDATABASE" "$1"
echo 'Restore completed. Reapply runtime-role grants, verify ledger/totals and object storage before resuming writes.'
