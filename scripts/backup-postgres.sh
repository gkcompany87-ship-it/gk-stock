#!/bin/sh
set -eu
umask 077
: "${PGHOST:?Set PGHOST}" "${PGUSER:?Set PGUSER}" "${PGDATABASE:?Set PGDATABASE}"
# Use ~/.pgpass or PGPASSFILE (0600), not a command-line password.
out=${BACKUP_DIR:-./backups}
mkdir -p "$out"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$out/$PGDATABASE-$stamp.dump"
trap 'rm -f "$file.partial"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$file.partial" "$PGDATABASE"
pg_restore --list "$file.partial" > "$file.contents"
mv "$file.partial" "$file"
if command -v sha256sum >/dev/null 2>&1; then sha256sum "$file" > "$file.sha256"; else shasum -a 256 "$file" > "$file.sha256"; fi
printf 'Backup created: %s\nCopy an encrypted copy off-site and test restoration.\n' "$file"
