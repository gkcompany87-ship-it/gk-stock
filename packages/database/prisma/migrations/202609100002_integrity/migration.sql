-- Cross-tenant checks, immutable history and deferred aggregate invariants.
-- These SQL-only invariants intentionally supplement Prisma's declarative schema.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'immutable_history: use a compensating operation' USING ERRCODE = '23514'; END;
$$;

CREATE TRIGGER "AuditLog_immutable" BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "StockMovement_immutable" BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "IdempotencyRecord_immutable" BEFORE UPDATE OR DELETE ON "IdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "FileAsset_immutable" BEFORE UPDATE OR DELETE ON "FileAsset" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "Invoice_no_delete" BEFORE DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "Quote_no_delete" BEFORE DELETE ON "Quote" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "DeliveryNote_no_delete" BEFORE DELETE ON "DeliveryNote" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "Payment_no_delete" BEFORE DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER "StockBalance_no_delete" BEFORE DELETE ON "StockBalance" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE FUNCTION enforce_tenant_references() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE row_data jsonb := to_jsonb(NEW); tenant text; ref_tenant text; parent_id text; i integer;
BEGIN
  tenant := CASE WHEN TG_TABLE_NAME = 'Company' THEN row_data->>'id' ELSE row_data->>'companyId' END;
  IF tenant IS NULL THEN RAISE EXCEPTION 'missing_tenant' USING ERRCODE='23514'; END IF;
  FOR i IN 0..TG_NARGS/2-1 LOOP
    parent_id := row_data->>TG_ARGV[i*2];
    IF parent_id IS NOT NULL THEN
      EXECUTE format('SELECT "companyId" FROM %I WHERE id=$1',TG_ARGV[i*2+1]) INTO ref_tenant USING parent_id;
      IF ref_tenant IS DISTINCT FROM tenant THEN RAISE EXCEPTION 'cross_tenant_reference' USING ERRCODE='23514'; END IF;
    END IF;
  END LOOP;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME <> 'Company' AND (to_jsonb(OLD)->>'companyId') IS DISTINCT FROM tenant THEN
    RAISE EXCEPTION 'tenant_is_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER "Company_tenant" BEFORE INSERT OR UPDATE ON "Company" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('logoAssetId','FileAsset');

CREATE TRIGGER "Product_tenant" BEFORE INSERT OR UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('imageAssetId','FileAsset','categoryId','ProductCategory');

CREATE TRIGGER "StockBalance_tenant" BEFORE INSERT OR UPDATE ON "StockBalance" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('productId','Product','warehouseId','Warehouse');

CREATE TRIGGER "StockMovement_tenant" BEFORE INSERT OR UPDATE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('productId','Product','warehouseId','Warehouse','userId','User','customerId','Customer','deliveryNoteId','DeliveryNote','reversedMovementId','StockMovement');

CREATE TRIGGER "Address_tenant" BEFORE INSERT OR UPDATE ON "Address" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('customerId','Customer');

CREATE TRIGGER "Quote_tenant" BEFORE INSERT OR UPDATE ON "Quote" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('customerId','Customer','createdById','User');

CREATE TRIGGER "Invoice_tenant" BEFORE INSERT OR UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('customerId','Customer','quoteId','Quote','deliveryNoteId','DeliveryNote','createdById','User');

CREATE TRIGGER "DeliveryNote_tenant" BEFORE INSERT OR UPDATE ON "DeliveryNote" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('quoteId','Quote','warehouseId','Warehouse','customerId','Customer','createdById','User');

CREATE TRIGGER "Payment_tenant" BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('cancelledById','User','customerId','Customer','invoiceId','Invoice','receivedById','User');

CREATE TRIGGER "AuditLog_tenant" BEFORE INSERT OR UPDATE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('actorId','User');

CREATE TRIGGER "IdempotencyRecord_tenant" BEFORE INSERT OR UPDATE ON "IdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('actorId','User');

CREATE TRIGGER "StockIncident_tenant" BEFORE INSERT OR UPDATE ON "StockIncident" FOR EACH ROW EXECUTE FUNCTION enforce_tenant_references('movementId','StockMovement','reportedById','User','resolvedById','User');

CREATE FUNCTION enforce_user_role_tenant() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "User" u JOIN "Role" r ON r."companyId"=u."companyId" WHERE u.id=NEW."userId" AND r.id=NEW."roleId") THEN
   RAISE EXCEPTION 'cross_tenant_role' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "UserRole_tenant" BEFORE INSERT OR UPDATE ON "UserRole" FOR EACH ROW EXECUTE FUNCTION enforce_user_role_tenant();
ALTER TABLE "Product" ADD CONSTRAINT "Product_valid_values" CHECK ("purchasePrice">=0 AND "sellingPrice">=0 AND "taxRate" BETWEEN 0 AND 100 AND "minimumStock">=0);
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_tax_values" CHECK ("defaultTaxRate" BETWEEN 0 AND 100 AND jsonb_typeof("taxRates")='array');
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_valid" CHECK (year BETWEEN 2000 AND 9999 AND "nextNumber">=1 AND prefix ~ '^[A-Z][A-Z0-9-]{0,11}$');
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_valid_quantity" CHECK (quantity>0 AND abs("quantityAfter"-"quantityBefore")=quantity AND
 (type NOT IN ('INITIAL_STOCK','ENTRY','RETURN') OR "quantityAfter">"quantityBefore") AND
 (type NOT IN ('WITHDRAWAL','CUSTOMER_DELIVERY','DAMAGED') OR "quantityAfter"<"quantityBefore") AND
 ((type='CANCELLATION_REVERSAL')=("reversedMovementId" IS NOT NULL)));
CREATE UNIQUE INDEX "StockMovement_one_initial_per_balance" ON "StockMovement" ("productId","warehouseId") WHERE type='INITIAL_STOCK';

CREATE FUNCTION validate_balance_write() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE negative_allowed boolean;
BEGIN
 SELECT "allowNegativeStock" INTO negative_allowed FROM "BusinessSettings" WHERE "companyId"=NEW."companyId" FOR SHARE;
 IF negative_allowed IS NULL OR (NEW.quantity<0 AND NOT negative_allowed) THEN RAISE EXCEPTION 'negative_stock_forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD."productId",OLD."warehouseId",OLD."companyId") IS DISTINCT FROM (NEW."productId",NEW."warehouseId",NEW."companyId") THEN
   RAISE EXCEPTION 'balance_identity_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockBalance_validate" BEFORE INSERT OR UPDATE ON "StockBalance" FOR EACH ROW EXECUTE FUNCTION validate_balance_write();

CREATE FUNCTION validate_stock_movement() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE current_quantity numeric; ledger_before numeric; original "StockMovement"%ROWTYPE; delivery "DeliveryNote"%ROWTYPE;
BEGIN
 SELECT quantity INTO current_quantity FROM "StockBalance" WHERE "productId"=NEW."productId" AND "warehouseId"=NEW."warehouseId" FOR UPDATE;
 SELECT coalesce(sum("quantityAfter"-"quantityBefore"),0) INTO ledger_before FROM "StockMovement" WHERE "productId"=NEW."productId" AND "warehouseId"=NEW."warehouseId";
 IF current_quantity IS DISTINCT FROM NEW."quantityAfter" OR ledger_before<>NEW."quantityBefore" THEN
   RAISE EXCEPTION 'movement_chain_mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.type='INITIAL_STOCK' AND EXISTS(SELECT 1 FROM "StockMovement" WHERE "productId"=NEW."productId" AND "warehouseId"=NEW."warehouseId") THEN
   RAISE EXCEPTION 'initial_stock_already_established' USING ERRCODE='23514'; END IF;
 IF NEW."reversedMovementId" IS NOT NULL THEN
   SELECT * INTO original FROM "StockMovement" WHERE id=NEW."reversedMovementId" FOR UPDATE;
   IF original.id IS NULL OR original.type='CANCELLATION_REVERSAL' OR
     (original."companyId",original."productId",original."warehouseId",original."customerId",original."deliveryNoteId",original.quantity)
       IS DISTINCT FROM (NEW."companyId",NEW."productId",NEW."warehouseId",NEW."customerId",NEW."deliveryNoteId",NEW.quantity) OR
     (original."quantityAfter"-original."quantityBefore") <> -(NEW."quantityAfter"-NEW."quantityBefore") THEN
       RAISE EXCEPTION 'invalid_reversal' USING ERRCODE='23514'; END IF;
 END IF;
 IF (NEW.type='CUSTOMER_DELIVERY' AND NEW."deliveryNoteId" IS NULL) OR
    (NEW."deliveryNoteId" IS NOT NULL AND NEW.type NOT IN ('CUSTOMER_DELIVERY','CANCELLATION_REVERSAL')) THEN
   RAISE EXCEPTION 'invalid_delivery_movement_type' USING ERRCODE='23514'; END IF;
 IF NEW."deliveryNoteId" IS NOT NULL THEN
   SELECT * INTO delivery FROM "DeliveryNote" WHERE id=NEW."deliveryNoteId";
   IF (NEW."customerId",NEW."warehouseId") IS DISTINCT FROM (delivery."customerId",delivery."warehouseId") THEN
     RAISE EXCEPTION 'delivery_movement_reference_mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockMovement_validate" BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION validate_stock_movement();

CREATE FUNCTION reconcile_balance() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE p text := NEW."productId"; w text := NEW."warehouseId"; balance numeric; ledger numeric;
BEGIN
 SELECT quantity INTO balance FROM "StockBalance" WHERE "productId"=p AND "warehouseId"=w;
 SELECT coalesce(sum("quantityAfter"-"quantityBefore"),0) INTO ledger FROM "StockMovement" WHERE "productId"=p AND "warehouseId"=w;
 IF balance IS DISTINCT FROM ledger THEN RAISE EXCEPTION 'stock_ledger_drift' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "StockBalance_reconcile" AFTER INSERT OR UPDATE ON "StockBalance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_balance();
CREATE CONSTRAINT TRIGGER "StockMovement_reconcile" AFTER INSERT ON "StockMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_balance();

CREATE FUNCTION protect_document_line() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE data jsonb; parent_id text; parent_status text; tenant text; product_tenant text;
BEGIN
 data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 parent_id:=data->>TG_ARGV[1];
 EXECUTE format('SELECT status::text,"companyId" FROM %I WHERE id=$1 FOR UPDATE',TG_ARGV[0]) INTO parent_status,tenant USING parent_id;
 IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'issued_lines_immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>TG_ARGV[1]) IS DISTINCT FROM parent_id THEN RAISE EXCEPTION 'line_parent_immutable' USING ERRCODE='23514'; END IF;
 IF data->>'productId' IS NOT NULL THEN
   SELECT "companyId" INTO product_tenant FROM "Product" WHERE id=data->>'productId';
   IF product_tenant IS DISTINCT FROM tenant THEN RAISE EXCEPTION 'cross_tenant_product_line' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

CREATE FUNCTION protect_issued_document() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE mutable text[]:=ARRAY['status','updatedAt','version','cancelledAt','cancellationReason']; allowed boolean:=false;
BEGIN
 IF TG_TABLE_NAME='Invoice' THEN mutable:=mutable||ARRAY['paidAmount','remainingAmount']; END IF;
 IF OLD.status::text<>'DRAFT' AND (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN
   RAISE EXCEPTION 'issued_document_immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status::text='CANCELLED' THEN RAISE EXCEPTION 'cancelled_document_immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status=NEW.status THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='Quote' THEN
   allowed:= (OLD.status::text='DRAFT' AND NEW.status::text IN ('SENT','CANCELLED')) OR
    (OLD.status::text='SENT' AND NEW.status::text IN ('ACCEPTED','REJECTED','EXPIRED','CANCELLED')) OR
    (OLD.status::text='ACCEPTED' AND NEW.status::text='CANCELLED');
 ELSIF TG_TABLE_NAME='Invoice' THEN
   allowed:= (OLD.status::text='DRAFT' AND NEW.status::text IN ('ISSUED','PAID','CANCELLED')) OR
    (OLD.status::text IN ('ISSUED','PARTIALLY_PAID','PAID','OVERDUE') AND NEW.status::text IN ('ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'));
 ELSE
   allowed:= (OLD.status::text='DRAFT' AND NEW.status::text IN ('CONFIRMED','CANCELLED')) OR
    (OLD.status::text='CONFIRMED' AND NEW.status::text IN ('DELIVERED','CANCELLED')) OR
    (OLD.status::text='DELIVERED' AND NEW.status::text='CANCELLED');
 END IF;
 IF NOT allowed THEN RAISE EXCEPTION 'invalid_document_transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION reconcile_document_lines() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE parent_id text; doc record; totals record; data jsonb;
BEGIN
 data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 parent_id:=CASE WHEN TG_TABLE_NAME=TG_ARGV[0] THEN data->>'id' ELSE data->>TG_ARGV[2] END;
 EXECUTE format('SELECT * FROM %I WHERE id=$1',TG_ARGV[0]) INTO doc USING parent_id;
 IF doc.id IS NULL THEN RETURN NULL; END IF;
 EXECUTE format('SELECT count(*) AS count,coalesce(sum(subtotal),0) AS subtotal,coalesce(sum("discountAmount"+"documentDiscountAmount"),0) AS discount,coalesce(sum("taxAmount"),0) AS tax,coalesce(sum(total),0) AS total,coalesce(sum("documentDiscountAmount"),0) AS global_discount,coalesce(sum(subtotal-"discountAmount"),0) AS base FROM %I WHERE %I=$1',TG_ARGV[1],TG_ARGV[2]) INTO totals USING parent_id;
 IF totals.count NOT BETWEEN 1 AND 200 OR
   (doc.subtotal,doc."discountAmount",doc."taxAmount",doc.total) IS DISTINCT FROM (totals.subtotal,totals.discount,totals.tax,totals.total) OR
   totals.global_discount <> round(totals.base*doc."documentDiscountRate"/100,3) THEN
   RAISE EXCEPTION 'document_line_totals_mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;

ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_valid" CHECK (
 position>=0 AND quantity>0 AND "unitPrice">=0 AND "discountRate" BETWEEN 0 AND 100 AND "taxRate" BETWEEN 0 AND 100 AND
 subtotal=round(quantity*"unitPrice",3) AND "discountAmount"=round(subtotal*"discountRate"/100,3) AND
 "documentDiscountAmount" BETWEEN 0 AND (subtotal-"discountAmount") AND
 "taxableAmount"=subtotal-"discountAmount"-"documentDiscountAmount" AND "taxAmount"=round("taxableAmount"*"taxRate"/100,3) AND total="taxableAmount"+"taxAmount");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_valid_header" CHECK (
 version>=1 AND "documentDiscountRate" BETWEEN 0 AND 100 AND subtotal>=0 AND "discountAmount" BETWEEN 0 AND subtotal AND "taxAmount">=0 AND total=subtotal-"discountAmount"+"taxAmount" AND
 (status::text IN ('DRAFT','CANCELLED') OR (number IS NOT NULL AND snapshot IS NOT NULL AND "snapshotHash" IS NOT NULL AND "issueDate" IS NOT NULL)) AND
 (status::text<>'DRAFT' OR (number IS NULL AND snapshot IS NULL AND "snapshotHash" IS NULL)) AND
 (status::text<>'CANCELLED' OR ("cancelledAt" IS NOT NULL AND length("cancellationReason")>=5)));
CREATE TRIGGER "QuoteLine_protect" BEFORE INSERT OR UPDATE OR DELETE ON "QuoteLine" FOR EACH ROW EXECUTE FUNCTION protect_document_line('Quote','quoteId');
CREATE TRIGGER "Quote_protect" BEFORE UPDATE ON "Quote" FOR EACH ROW EXECUTE FUNCTION protect_issued_document();
CREATE CONSTRAINT TRIGGER "Quote_line_totals" AFTER INSERT OR UPDATE ON "Quote" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_document_lines('Quote','QuoteLine','quoteId');
CREATE CONSTRAINT TRIGGER "QuoteLine_header_totals" AFTER INSERT OR UPDATE OR DELETE ON "QuoteLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_document_lines('Quote','QuoteLine','quoteId');

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_valid" CHECK (
 position>=0 AND quantity>0 AND "unitPrice">=0 AND "discountRate" BETWEEN 0 AND 100 AND "taxRate" BETWEEN 0 AND 100 AND
 subtotal=round(quantity*"unitPrice",3) AND "discountAmount"=round(subtotal*"discountRate"/100,3) AND
 "documentDiscountAmount" BETWEEN 0 AND (subtotal-"discountAmount") AND
 "taxableAmount"=subtotal-"discountAmount"-"documentDiscountAmount" AND "taxAmount"=round("taxableAmount"*"taxRate"/100,3) AND total="taxableAmount"+"taxAmount");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_valid_header" CHECK (
 version>=1 AND "documentDiscountRate" BETWEEN 0 AND 100 AND subtotal>=0 AND "discountAmount" BETWEEN 0 AND subtotal AND "taxAmount">=0 AND total=subtotal-"discountAmount"+"taxAmount" AND
 (status::text IN ('DRAFT','CANCELLED') OR (number IS NOT NULL AND snapshot IS NOT NULL AND "snapshotHash" IS NOT NULL AND "issueDate" IS NOT NULL)) AND
 (status::text<>'DRAFT' OR (number IS NULL AND snapshot IS NULL AND "snapshotHash" IS NULL)) AND
 (status::text<>'CANCELLED' OR ("cancelledAt" IS NOT NULL AND length("cancellationReason")>=5)));
CREATE TRIGGER "InvoiceLine_protect" BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION protect_document_line('Invoice','invoiceId');
CREATE TRIGGER "Invoice_protect" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION protect_issued_document();
CREATE CONSTRAINT TRIGGER "Invoice_line_totals" AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_document_lines('Invoice','InvoiceLine','invoiceId');
CREATE CONSTRAINT TRIGGER "InvoiceLine_header_totals" AFTER INSERT OR UPDATE OR DELETE ON "InvoiceLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_document_lines('Invoice','InvoiceLine','invoiceId');

ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_valid" CHECK (
 position>=0 AND quantity>0 AND "unitPrice">=0 AND "discountRate" BETWEEN 0 AND 100 AND "taxRate" BETWEEN 0 AND 100 AND
 subtotal=round(quantity*"unitPrice",3) AND "discountAmount"=round(subtotal*"discountRate"/100,3) AND
 "documentDiscountAmount" BETWEEN 0 AND (subtotal-"discountAmount") AND
 "taxableAmount"=subtotal-"discountAmount"-"documentDiscountAmount" AND "taxAmount"=round("taxableAmount"*"taxRate"/100,3) AND total="taxableAmount"+"taxAmount");
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_valid_header" CHECK (
 version>=1 AND "documentDiscountRate" BETWEEN 0 AND 100 AND subtotal>=0 AND "discountAmount" BETWEEN 0 AND subtotal AND "taxAmount">=0 AND total=subtotal-"discountAmount"+"taxAmount" AND
 (status::text IN ('DRAFT','CANCELLED') OR (number IS NOT NULL AND snapshot IS NOT NULL AND "snapshotHash" IS NOT NULL AND "issueDate" IS NOT NULL)) AND
 (status::text<>'DRAFT' OR (number IS NULL AND snapshot IS NULL AND "snapshotHash" IS NULL)) AND
 (status::text<>'CANCELLED' OR ("cancelledAt" IS NOT NULL AND length("cancellationReason")>=5)));
CREATE TRIGGER "DeliveryNoteLine_protect" BEFORE INSERT OR UPDATE OR DELETE ON "DeliveryNoteLine" FOR EACH ROW EXECUTE FUNCTION protect_document_line('DeliveryNote','deliveryNoteId');
CREATE TRIGGER "DeliveryNote_protect" BEFORE UPDATE ON "DeliveryNote" FOR EACH ROW EXECUTE FUNCTION protect_issued_document();
CREATE CONSTRAINT TRIGGER "DeliveryNote_line_totals" AFTER INSERT OR UPDATE ON "DeliveryNote" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_document_lines('DeliveryNote','DeliveryNoteLine','deliveryNoteId');
CREATE CONSTRAINT TRIGGER "DeliveryNoteLine_header_totals" AFTER INSERT OR UPDATE OR DELETE ON "DeliveryNoteLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_document_lines('DeliveryNote','DeliveryNoteLine','deliveryNoteId');

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_valid_balance" CHECK ("paidAmount" BETWEEN 0 AND total AND "remainingAmount"=total-"paidAmount");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_valid" CHECK (amount>0 AND ("cancelledAt" IS NULL OR ("cancelledById" IS NOT NULL AND length("cancellationReason")>=5)));
CREATE FUNCTION protect_payment() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE invoice "Invoice"%ROWTYPE;
BEGIN
 SELECT * INTO invoice FROM "Invoice" WHERE id=NEW."invoiceId" FOR UPDATE;
 IF NEW."customerId" IS DISTINCT FROM invoice."customerId" OR invoice.status IN ('DRAFT','CANCELLED') THEN
   RAISE EXCEPTION 'invoice_not_payable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(OLD)-ARRAY['cancelledAt','cancelledById','cancellationReason']) IS DISTINCT FROM
 (to_jsonb(NEW)-ARRAY['cancelledAt','cancelledById','cancellationReason']) OR OLD."cancelledAt" IS NOT NULL OR NEW."cancelledAt" IS NULL) THEN
   RAISE EXCEPTION 'payment_only_cancellable_once' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "Payment_protect" BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION protect_payment();
CREATE FUNCTION reconcile_invoice_payments() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE invoice_id text; invoice "Invoice"%ROWTYPE; paid numeric;
BEGIN
 invoice_id:=CASE WHEN TG_TABLE_NAME='Invoice' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'invoiceId' END;
 SELECT * INTO invoice FROM "Invoice" WHERE id=invoice_id;
 SELECT coalesce(sum(amount),0) INTO paid FROM "Payment" WHERE "invoiceId"=invoice_id AND "cancelledAt" IS NULL;
 IF invoice."paidAmount"<>paid OR (invoice.status IN ('DRAFT','CANCELLED') AND paid<>0) OR
    (invoice.status='PAID' AND invoice."remainingAmount"<>0) OR
    (invoice.status='PARTIALLY_PAID' AND NOT (paid>0 AND invoice."remainingAmount">0)) OR
    (invoice.status='ISSUED' AND (paid<>0 OR invoice."remainingAmount"<=0)) THEN
   RAISE EXCEPTION 'invoice_payment_balance_mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "Invoice_payments" AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_invoice_payments();
CREATE CONSTRAINT TRIGGER "Payment_invoice" AFTER INSERT OR UPDATE ON "Payment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_invoice_payments();

CREATE FUNCTION reconcile_delivery_stock() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE delivery_id text; delivery "DeliveryNote"%ROWTYPE;
BEGIN
 delivery_id:=CASE WHEN TG_TABLE_NAME='DeliveryNote' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'deliveryNoteId' END;
 IF delivery_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO delivery FROM "DeliveryNote" WHERE id=delivery_id;
 IF delivery."stockDeductedAt" IS NULL THEN
   IF EXISTS(SELECT 1 FROM "StockMovement" WHERE "deliveryNoteId"=delivery_id) THEN RAISE EXCEPTION 'unconfirmed_delivery_stock' USING ERRCODE='23514'; END IF;
   RETURN NULL;
 END IF;
 IF EXISTS(WITH expected AS (SELECT "productId",sum(quantity) AS q FROM "DeliveryNoteLine" WHERE "deliveryNoteId"=delivery_id AND "productId" IS NOT NULL GROUP BY "productId"),
 actual AS (SELECT "productId",sum(quantity) AS q FROM "StockMovement" WHERE "deliveryNoteId"=delivery_id AND type='CUSTOMER_DELIVERY' GROUP BY "productId")
 SELECT 1 FROM expected e FULL JOIN actual a USING ("productId") WHERE coalesce(e.q,0)<>coalesce(a.q,0)) THEN
   RAISE EXCEPTION 'delivery_stock_mismatch' USING ERRCODE='23514'; END IF;
 IF delivery.status='CANCELLED' AND EXISTS(SELECT 1 FROM "StockMovement" m WHERE m."deliveryNoteId"=delivery_id AND m.type='CUSTOMER_DELIVERY' AND NOT EXISTS(SELECT 1 FROM "StockMovement" r WHERE r."reversedMovementId"=m.id)) THEN
   RAISE EXCEPTION 'delivery_missing_reversal' USING ERRCODE='23514'; END IF;
 IF delivery.status<>'CANCELLED' AND EXISTS(SELECT 1 FROM "StockMovement" WHERE "deliveryNoteId"=delivery_id AND type='CANCELLATION_REVERSAL') THEN
   RAISE EXCEPTION 'delivery_unexpected_reversal' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "DeliveryNote_stock" AFTER INSERT OR UPDATE ON "DeliveryNote" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_delivery_stock();
CREATE CONSTRAINT TRIGGER "StockMovement_delivery" AFTER INSERT ON "StockMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_delivery_stock();
