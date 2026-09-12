# Backup and restore

## Policy

Take at least daily encrypted off-site backups, plus a fresh backup before schema/deployment changes. Retention is a business decision: the example environment suggests 14 days but the scripts deliberately do not automatically delete old copies. Define required recovery point/time objectives, retention/legal obligations, access control and an accountable operator with the client.

PostgreSQL dumps alone are insufficient. Also back up the private S3 bucket (PDF originals/images/attachments), encryption keys/secret configuration separately, migration/application release identifiers and Caddy certificate state where appropriate. Redis counters are rebuildable; the durable mail outbox, sessions and idempotency records live in PostgreSQL. Do not restore a database that refers to permanently lost PDF objects.

## Database dump from a client machine

Use matching-major PostgreSQL client tools or a supported newer `pg_dump`; do not use an older client against a newer server. Put credentials in a mode-0600 `PGPASSFILE`, not a shell-history URL.

```sh
export PGHOST=<private-database-host>
export PGPORT=5432
export PGUSER=<backup-authorized-user>
export PGDATABASE=as_tino_stock
export PGPASSFILE=<path-to-0600-password-file>
export BACKUP_DIR=<private-backup-directory>
sh scripts/backup-postgres.sh
```

The script creates a custom-format dump atomically, a table-of-contents listing and SHA-256 checksum. It exits on failure and does not advertise a partial dump as a complete one. Transfer an encrypted copy off the VPS and verify the checksum at the destination. Do not commit dump files or backups to Git.

## Dump through the production container

This avoids publicly exposing the database or installing host clients. Run from the project root using the `dc` function in deployment.md.

```sh
umask 077
mkdir -p backups
name="backups/as_tino_stock-$(date -u +%Y%m%dT%H%M%SZ).dump"
dc exec -T postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$name.partial" && mv "$name.partial" "$name"
```

Check the command exit code and dump contents before copying/encrypting it. A complete database dump contains `_prisma_migrations` and the integrity triggers. A data-only dump is not an equivalent disaster recovery backup.

## Restore into an empty database

Never restore over a running production database as a test. Create a new empty database using the migration owner. Verify the dump's checksum first. The restore helper requires an exact database-name confirmation and refuses a nonempty public schema.

```sh
export PGHOST=<restore-host>
export PGUSER=<migration-owner>
export PGDATABASE=as_tino_restore_test
export PGPASSFILE=<path-to-0600-password-file>
export CONFIRM_RESTORE_DATABASE=as_tino_restore_test
sh scripts/restore-postgres.sh <verified-custom-format-dump>
```

The helper uses a single transaction, fails on the first error and does not drop existing objects. A full restore loads data before re-creating triggers and constraints. Do **not** run the migration first and then load this full dump. Apply only later migrations after checking the restored `_prisma_migrations` state, using the matching release.

Reapply runtime-role grants, restore object versions and verify every referenced issued PDF checksum. Point an isolated API instance at the restored database/bucket, not the production endpoints. Reconcile stock and payments, test role restrictions and document downloads, and record the achieved restore time and data age.

Useful reconciliation queries:

```sql
SELECT b."productId", b."warehouseId", b.quantity,
       coalesce(sum(m."quantityAfter"-m."quantityBefore"),0) AS ledger
FROM "StockBalance" b LEFT JOIN "StockMovement" m
 ON m."productId"=b."productId" AND m."warehouseId"=b."warehouseId"
GROUP BY b.id
HAVING b.quantity<>coalesce(sum(m."quantityAfter"-m."quantityBefore"),0);

SELECT i.id, i."paidAmount", coalesce(sum(p.amount) FILTER(WHERE p."cancelledAt" IS NULL),0) AS payments
FROM "Invoice" i LEFT JOIN "Payment" p ON p."invoiceId"=i.id
GROUP BY i.id
HAVING i."paidAmount"<>coalesce(sum(p.amount) FILTER(WHERE p."cancelledAt" IS NULL),0);
```

Both should return zero rows. Investigate mismatches rather than editing history. A checksum/constraint check is necessary but not sufficient; perform a business-level restore exercise regularly. On a real disaster, restore a coordinated snapshot, revoke old user sessions as appropriate, verify storage and only then reopen writes.
