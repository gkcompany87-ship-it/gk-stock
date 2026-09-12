import { config } from "dotenv";
import { resolve } from "node:path";
import { createPrismaClient } from "../src/index.js";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

if (process.env.CONFIRM_PURGE_DEMO !== "YES") {
  throw new Error("Set CONFIRM_PURGE_DEMO=YES to remove the legacy demo tenant and its data.");
}

const LEGACY_DEMO_SLUG = "as-tino-dev-demo";

// The integrity migration intentionally makes stock/history/documents immutable during
// normal application use. A one-time demo-tenant purge is an administrative exception:
// we temporarily disable only user-defined triggers on the affected history/document
// tables, inside the same PostgreSQL transaction. PostgreSQL rolls these ALTER TABLE
// statements back automatically if any part of the purge fails. FK/system triggers stay on.
const purgeTriggerTables = [
  "AuditLog",
  "StockMovement",
  "IdempotencyRecord",
  "FileAsset",
  "Invoice",
  "Quote",
  "DeliveryNote",
  "Payment",
  "StockBalance",
  "QuoteLine",
  "InvoiceLine",
  "DeliveryNoteLine"
] as const;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function setUserTriggers(
  tx: { $executeRawUnsafe(query: string): Promise<number> },
  enabled: boolean
) {
  const action = enabled ? "ENABLE" : "DISABLE";
  for (const table of purgeTriggerTables) {
    await tx.$executeRawUnsafe(`ALTER TABLE ${quoteIdentifier(table)} ${action} TRIGGER USER`);
  }
}

const prisma = createPrismaClient();

try {
  // Deliberately match only the known legacy seed slug. Do not use fuzzy company-name
  // matching here: a real client company must never become purgeable because its name
  // happens to contain words such as "Demo".
  const demo = await prisma.company.findUnique({
    where: { slug: LEGACY_DEMO_SLUG },
    select: { id: true, slug: true, name: true }
  });

  if (!demo) {
    console.log("No legacy demo tenant found. Nothing deleted.");
  } else {
    console.log(`Purging legacy demo tenant ${demo.slug} (${demo.name})...`);

    await prisma.$transaction(
      async (tx) => {
        // Re-check inside the transaction before making the destructive change.
        const target = await tx.company.findUnique({
          where: { slug: LEGACY_DEMO_SLUG },
          select: { id: true }
        });
        if (!target || target.id !== demo.id) {
          throw new Error("Legacy demo tenant changed while purge was starting. Nothing was deleted.");
        }

        await setUserTriggers(tx, false);

        // Break the optional Company -> FileAsset logo reference before the cascading
        // company delete. All of this is still inside the same rollback-safe transaction.
        await tx.company.update({
          where: { id: demo.id },
          data: { logoAssetId: null }
        });

        // These three models intentionally do not cascade from Company in the Prisma
        // schema, so delete them explicitly before deleting the tenant.
        await tx.mailOutbox.deleteMany({ where: { companyId: demo.id } });
        await tx.stockIncident.deleteMany({ where: { companyId: demo.id } });
        await tx.idempotencyRecord.deleteMany({ where: { companyId: demo.id } });

        // All remaining tenant-owned rows cascade from Company. FK/system triggers remain
        // enabled; only the application's normal immutability triggers are suspended.
        await tx.company.delete({ where: { id: demo.id } });

        await setUserTriggers(tx, true);
      },
      { timeout: 60_000, maxWait: 10_000 }
    );

    console.log("Legacy demo tenant and all tenant-owned mock data were deleted successfully.");
    console.log("Global permission definitions were preserved.");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/must be owner|permission denied/i.test(message)) {
    throw new Error(
      "Demo purge needs the PostgreSQL schema-owner connection because it temporarily disables application triggers inside one transaction. Use your local owner DATABASE_URL for this one-time cleanup, then restore the normal runtime role.",
      { cause: error }
    );
  }
  throw error;
} finally {
  await prisma.$disconnect();
}
