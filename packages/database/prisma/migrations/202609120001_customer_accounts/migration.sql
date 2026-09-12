CREATE TYPE "CustomerAdjustmentDirection" AS ENUM ('CUSTOMER_OWES_US', 'WE_OWE_CUSTOMER');

CREATE TABLE "CustomerAdjustment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "direction" "CustomerAdjustmentDirection" NOT NULL,
    "amount" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerAdjustment_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "CustomerAdjustment_companyId_idempotencyKey_key"
ON "CustomerAdjustment"("companyId", "idempotencyKey");

CREATE INDEX "CustomerAdjustment_companyId_customerId_effectiveAt_idx"
ON "CustomerAdjustment"("companyId", "customerId", "effectiveAt");

ALTER TABLE "CustomerAdjustment"
ADD CONSTRAINT "CustomerAdjustment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerAdjustment"
ADD CONSTRAINT "CustomerAdjustment_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerAdjustment"
ADD CONSTRAINT "CustomerAdjustment_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
