-- Initial schema for a NEW database. Do not apply to an existing unmanaged database.
-- SQL-only constraints/triggers are intentional; preserve them in future migrations.


CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "StockMovementType" AS ENUM ('INITIAL_STOCK', 'ENTRY', 'WITHDRAWAL', 'CUSTOMER_DELIVERY', 'RETURN', 'DAMAGED', 'ADJUSTMENT', 'CANCELLATION_REVERSAL');

CREATE TYPE "CustomerType" AS ENUM ('COMPANY', 'INDIVIDUAL');

CREATE TYPE "AddressKind" AS ENUM ('BILLING', 'DELIVERY');

CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

CREATE TYPE "DeliveryNoteStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'CARD', 'OTHER');

CREATE TYPE "DocumentType" AS ENUM ('QUOTE', 'INVOICE', 'DELIVERY_NOTE');

CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "Company" (
    "logoAssetId" TEXT,
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxIdentificationNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr-TN',
    "currency" TEXT NOT NULL DEFAULT 'TND',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Tunis',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "RefreshSession" (
    "familyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "rotatedFromId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "imageAssetId" TEXT,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "purchasePrice" DECIMAL(14,3) NOT NULL,
    "sellingPrice" DECIMAL(14,3) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 19,
    "minimumStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "location" TEXT,
    "imageUrl" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
    "requestHash" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "deliveryNoteId" TEXT,
    "reversedMovementId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "quantityBefore" DECIMAL(14,3) NOT NULL,
    "quantityAfter" DECIMAL(14,3) NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT NOT NULL,
    "taxIdentificationNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "AddressKind" NOT NULL,
    "rawText" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Quote" (
    "version" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB,
    "snapshotHash" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" TEXT,
    "documentDiscountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "number" TEXT,
    "internalRef" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMPTZ(3),
    "expiryDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "terms" TEXT,
    "subtotal" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteLine" (
    "position" INTEGER NOT NULL,
    "discountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "documentDiscountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,3) NOT NULL,
    "discountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,3) NOT NULL,
    "taxAmount" DECIMAL(14,3) NOT NULL,
    "total" DECIMAL(14,3) NOT NULL,
    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "version" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB,
    "snapshotHash" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" TEXT,
    "documentDiscountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quoteId" TEXT,
    "deliveryNoteId" TEXT,
    "createdById" TEXT NOT NULL,
    "number" TEXT,
    "internalRef" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMPTZ(3),
    "dueDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "terms" TEXT,
    "subtotal" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
    "position" INTEGER NOT NULL,
    "discountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "documentDiscountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,3) NOT NULL,
    "discountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,3) NOT NULL,
    "taxAmount" DECIMAL(14,3) NOT NULL,
    "total" DECIMAL(14,3) NOT NULL,
    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryNote" (
    "quoteId" TEXT,
    "warehouseId" TEXT,
    "terms" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB,
    "snapshotHash" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" TEXT,
    "documentDiscountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "number" TEXT,
    "internalRef" TEXT NOT NULL,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMPTZ(3),
    "deliveryDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "subtotal" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "stockDeductedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryNoteLine" (
    "position" INTEGER NOT NULL,
    "discountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "documentDiscountAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,3) NOT NULL,
    "discountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,3) NOT NULL,
    "taxAmount" DECIMAL(14,3) NOT NULL,
    "total" DECIMAL(14,3) NOT NULL,
    CONSTRAINT "DeliveryNoteLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "idempotencyKey" TEXT NOT NULL,
    "cancellationReason" TEXT,
    "cancelledById" TEXT,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "amount" DECIMAL(14,3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileAsset" (
    "snapshotHash" TEXT,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessSettings" (
    "taxRates" JSONB NOT NULL DEFAULT '["0","7","13","19"]'::jsonb,
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "quotePrefix" TEXT NOT NULL DEFAULT 'DEV',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC',
    "deliveryNotePrefix" TEXT NOT NULL DEFAULT 'BL',
    "defaultTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 19,
    "documentDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "paymentTerms" TEXT NOT NULL DEFAULT 'Paiement a reception de la facture.',
    "footerText" TEXT NOT NULL DEFAULT 'Generated by AS TINO DEV',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    CONSTRAINT "StockIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailOutbox" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "documentId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_slug_key" ON "Company" ("slug");

CREATE UNIQUE INDEX "User_companyId_email_key" ON "User" ("companyId", "email");

CREATE INDEX "User_companyId_status_idx" ON "User" ("companyId", "status");

CREATE UNIQUE INDEX "Role_companyId_code_key" ON "Role" ("companyId", "code");

CREATE UNIQUE INDEX "Permission_code_key" ON "Permission" ("code");

CREATE UNIQUE INDEX "RefreshSession_rotatedFromId_key" ON "RefreshSession" ("rotatedFromId");

CREATE INDEX "RefreshSession_userId_expiresAt_idx" ON "RefreshSession" ("userId", "expiresAt");

CREATE INDEX "RefreshSession_familyId_revokedAt_idx" ON "RefreshSession" ("familyId", "revokedAt");

CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken" ("userId", "expiresAt");

CREATE UNIQUE INDEX "ProductCategory_companyId_name_key" ON "ProductCategory" ("companyId", "name");

CREATE INDEX "ProductCategory_companyId_active_idx" ON "ProductCategory" ("companyId", "active");

CREATE UNIQUE INDEX "Warehouse_companyId_code_key" ON "Warehouse" ("companyId", "code");

CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product" ("companyId", "sku");

CREATE UNIQUE INDEX "Product_companyId_barcode_key" ON "Product" ("companyId", "barcode");

CREATE INDEX "Product_companyId_status_idx" ON "Product" ("companyId", "status");

CREATE INDEX "Product_companyId_name_idx" ON "Product" ("companyId", "name");

CREATE INDEX "Product_companyId_categoryId_status_idx" ON "Product" ("companyId", "categoryId", "status");

CREATE UNIQUE INDEX "StockBalance_productId_warehouseId_key" ON "StockBalance" ("productId", "warehouseId");

CREATE INDEX "StockBalance_companyId_quantity_idx" ON "StockBalance" ("companyId", "quantity");

CREATE UNIQUE INDEX "StockMovement_reversedMovementId_key" ON "StockMovement" ("reversedMovementId");

CREATE UNIQUE INDEX "StockMovement_companyId_idempotencyKey_key" ON "StockMovement" ("companyId", "idempotencyKey");

CREATE INDEX "StockMovement_companyId_createdAt_idx" ON "StockMovement" ("companyId", "createdAt");

CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement" ("productId", "createdAt");

CREATE INDEX "StockMovement_userId_createdAt_idx" ON "StockMovement" ("userId", "createdAt");

CREATE INDEX "StockMovement_productId_warehouseId_createdAt_idx" ON "StockMovement" ("productId", "warehouseId", "createdAt");

CREATE INDEX "StockMovement_deliveryNoteId_idx" ON "StockMovement" ("deliveryNoteId");

CREATE INDEX "Customer_companyId_active_idx" ON "Customer" ("companyId", "active");

CREATE INDEX "Customer_companyId_contactName_idx" ON "Customer" ("companyId", "contactName");

CREATE UNIQUE INDEX "Address_customerId_kind_key" ON "Address" ("customerId", "kind");

CREATE UNIQUE INDEX "Quote_internalRef_key" ON "Quote" ("internalRef");

CREATE UNIQUE INDEX "Quote_companyId_number_key" ON "Quote" ("companyId", "number");

CREATE INDEX "Quote_companyId_status_createdAt_idx" ON "Quote" ("companyId", "status", "createdAt");

CREATE INDEX "Quote_customerId_createdAt_idx" ON "Quote" ("customerId", "createdAt");

CREATE UNIQUE INDEX "QuoteLine_quoteId_position_key" ON "QuoteLine" ("quoteId", "position");

CREATE UNIQUE INDEX "Invoice_quoteId_key" ON "Invoice" ("quoteId");

CREATE UNIQUE INDEX "Invoice_deliveryNoteId_key" ON "Invoice" ("deliveryNoteId");

CREATE UNIQUE INDEX "Invoice_internalRef_key" ON "Invoice" ("internalRef");

CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice" ("companyId", "number");

CREATE INDEX "Invoice_companyId_status_createdAt_idx" ON "Invoice" ("companyId", "status", "createdAt");

CREATE INDEX "Invoice_customerId_createdAt_idx" ON "Invoice" ("customerId", "createdAt");

CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine" ("invoiceId", "position");

CREATE UNIQUE INDEX "DeliveryNote_quoteId_key" ON "DeliveryNote" ("quoteId");

CREATE UNIQUE INDEX "DeliveryNote_internalRef_key" ON "DeliveryNote" ("internalRef");

CREATE UNIQUE INDEX "DeliveryNote_companyId_number_key" ON "DeliveryNote" ("companyId", "number");

CREATE INDEX "DeliveryNote_companyId_status_createdAt_idx" ON "DeliveryNote" ("companyId", "status", "createdAt");

CREATE INDEX "DeliveryNote_customerId_createdAt_idx" ON "DeliveryNote" ("customerId", "createdAt");

CREATE UNIQUE INDEX "DeliveryNoteLine_deliveryNoteId_position_key" ON "DeliveryNoteLine" ("deliveryNoteId", "position");

CREATE UNIQUE INDEX "Payment_companyId_idempotencyKey_key" ON "Payment" ("companyId", "idempotencyKey");

CREATE INDEX "Payment_companyId_paidAt_idx" ON "Payment" ("companyId", "paidAt");

CREATE INDEX "Payment_invoiceId_idx" ON "Payment" ("invoiceId");

CREATE UNIQUE INDEX "DocumentSequence_companyId_documentType_year_key" ON "DocumentSequence" ("companyId", "documentType", "year");

CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset" ("storageKey");

CREATE UNIQUE INDEX "FileAsset_companyId_entityType_entityId_snapshotHash_key" ON "FileAsset" ("companyId", "entityType", "entityId", "snapshotHash");

CREATE INDEX "FileAsset_companyId_entityType_entityId_idx" ON "FileAsset" ("companyId", "entityType", "entityId");

CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog" ("companyId", "createdAt");

CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog" ("companyId", "entityType", "entityId");

CREATE UNIQUE INDEX "BusinessSettings_companyId_key" ON "BusinessSettings" ("companyId");

CREATE UNIQUE INDEX "IdempotencyRecord_companyId_key_key" ON "IdempotencyRecord" ("companyId", "key");

CREATE INDEX "IdempotencyRecord_companyId_createdAt_idx" ON "IdempotencyRecord" ("companyId", "createdAt");

CREATE UNIQUE INDEX "StockIncident_companyId_idempotencyKey_key" ON "StockIncident" ("companyId", "idempotencyKey");

CREATE INDEX "StockIncident_companyId_status_createdAt_idx" ON "StockIncident" ("companyId", "status", "createdAt");

CREATE INDEX "MailOutbox_status_nextAttemptAt_idx" ON "MailOutbox" ("status", "nextAttemptAt");

CREATE INDEX "MailOutbox_companyId_documentType_documentId_idx" ON "MailOutbox" ("companyId", "documentType", "documentId");

ALTER TABLE "Company" ADD CONSTRAINT "Company_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversedMovementId_fkey" FOREIGN KEY ("reversedMovementId") REFERENCES "StockMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Address" ADD CONSTRAINT "Address_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockIncident" ADD CONSTRAINT "StockIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockIncident" ADD CONSTRAINT "StockIncident_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockIncident" ADD CONSTRAINT "StockIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockIncident" ADD CONSTRAINT "StockIncident_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MailOutbox" ADD CONSTRAINT "MailOutbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
