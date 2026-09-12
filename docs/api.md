# REST API

All business routes are under `/api/v1`. Development Swagger is `/api/docs` when `SWAGGER_ENABLED=true`. Route discovery includes explicit schemas for core authentication, product/customer, stock, document and payment requests. Shared Zod schemas and service validation remain authoritative; complex role/settings bodies are also shown below. Production Swagger is disabled by default.

## Authentication, CSRF and errors

Use one cookie jar. Fetch `GET /auth/csrf`, then send `Origin: <exact allowed frontend origin>` and the returned `X-CSRF-Token` on every POST/PATCH/PUT/DELETE, including login, refresh and reset. Login/refresh rotate cookies; fetch a fresh CSRF token after rotation. Never put access or refresh credentials in localStorage or URLs. Swagger's headers are not an authentication bypass.

Responses carry `X-Request-ID`. Error JSON is `{ "error": { "status": 409, "code": "HTTP_409", "message": "...", "requestId": "..." }, "requestId": "..." }`; validation errors may include field `details`. Status codes: 400 invalid input, 401 missing/expired identity, 403 authorization/CSRF, 404 absent or hidden resource, 409 state/stock/uniqueness/idempotency conflict, 429 throttled, 503 dependency unavailable. Internal SQL/stack details are not public.

List envelopes are `{items,total,page,pageSize}`. `page` defaults 1, `pageSize` defaults 20 and is capped at 100. Most lists support `search`, `status`, `sortDirection`; products allow `sortBy` in `name`, `sku`, `createdAt`, `updatedAt`. Catalogue category/warehouse and role endpoints intentionally return compact arrays. Common validated optional filters are `productId`, `categoryId`, `warehouseId`, `userId`, `customerId`, `type`, `dateFrom`, `dateTo`, `entityType`, `action`; each module applies only its documented relevant subset. Unknown query keys are rejected. Pass ISO timestamps with an offset, including end-of-day where appropriate; do not assume a date-only upper bound includes the whole day.

Every amount/quantity is a **decimal string**, e.g. `"12.500"`; percentages also are strings. DTOs may serialize database decimals compactly (`"12.5"`) while product stock summaries use fixed three places; clients must not assume a fixed textual width. Money arithmetic uses shared exact functions, not JavaScript `Number`.

## Critical mutation idempotency

Commercial create/update/issue/transition/conversion/cancel/email and payment cancellation require `Idempotency-Key` in the header. Stock creation, scanner withdrawal, movement reversal/mistake report and payment creation use `idempotencyKey` in the JSON body. Use a UUID and keep the same key AND payload for a network retry. Change the key only for a genuinely new operation. The same key reused with another actor/body/scope returns 409. Product/customer/user master-data changes do not all have this durable-key mechanism; do not blindly retry their creations after an ambiguous connection failure.

## Core request examples

```json
{
  "sku": "TN-CLAV-001", "barcode": "6190000000004", "name": "Clavier USB",
  "unit": "piece", "purchasePrice": "25.125", "sellingPrice": "45.500",
  "taxRate": "19", "minimumStock": "3", "location": "A1-02"
}
```

POST `/products`; stock starts at zero. Use a stock movement for initial quantity. PATCH `/products/:id` only changes explicitly provided fields; archive is PATCH `/:id/archive`. Code lookup is GET `/scan/:code` and accepts SKU or barcode. A barcode cannot ambiguously match another product's SKU.

```json
{
  "code": "TN-CLAV-001", "warehouseId": "<warehouse-id>",
  "quantity": "2", "idempotencyKey": "<uuid>"
}
```

POST `/scan/withdraw`. Worker identity comes from the session, never the body. Admin POST `/stock-movements` instead uses `productId`, `warehouseId`, `type`, `quantity`, optional `direction` for adjustment, optional customer/note and body key. Types are INITIAL_STOCK, ENTRY, WITHDRAWAL, RETURN, DAMAGED, ADJUSTMENT; CUSTOMER_DELIVERY and CANCELLATION_REVERSAL are created only by controlled workflows.

```json
{
  "customerId": "<customer-id>",
  "dueDate": "2026-10-31T23:59:59+01:00",
  "documentDiscountRate": "0",
  "lines": [{"productId":"<optional-product-id>","description":"Clavier USB","quantity":"2","unit":"piece","unitPrice":"45.500","discountRate":"0","taxRate":"19"}],
  "notes":"Merci pour votre confiance."
}
```

POST `/quotes`, `/invoices`, `/delivery-notes`. For a free-text service omit productId, do not send the literal bracketed example. Delivery creation also accepts warehouseId. PATCH a draft with the full editable payload and its current integer `version`; issued/stale edits fail. Numbering occurs on POST `/quotes/:id/send`, `/invoices/:id/issue` or `/delivery-notes/:id/confirm`. A send/issue state change is distinct from POST `/:id/email` (202 queued); GET `/:id/email` lists delivery-job state.

Accepted quote conversion paths are `/:id/to-invoice` and `/:id/to-delivery-note`; confirmed/delivered notes support `/:id/to-invoice`. These are full one-to-one conversions. Cancelling any document requires `{ "reason": "At least five characters" }`. A linked invoice or payment may need cancellation first. GET `/:id/pdf` downloads an A4 PDF; `?original=1` preserves the original view of a cancelled document.

```json
{
  "invoiceId":"<issued-invoice-id>", "amount":"50.000", "method":"BANK_TRANSFER",
  "reference":"VIR-2026-104", "idempotencyKey":"<uuid>"
}
```

POST `/payments`; optional `paidAt` and notes. Overpayment and payment on draft/cancelled invoices fail. POST `/payments/:id/cancel` uses a reason and header key; it updates the invoice balance without deleting the receipt history.

## Other modules and filter scope

Customers require `type` (COMPANY/INDIVIDUAL), contactName, and companyName for COMPANY. Optional values include taxIdentificationNumber, email, phone, billingAddress/deliveryAddress text and notes. GET `/:id/timeline` combines paginated commercial events.

Users are created with `email`, `name`, `password`, `roleCodes`; PATCH accepts supported name/status/role changes, not arbitrary database fields. Roles use `code`, `name`, `permissions`. GET `/roles/permissions` lists the supported extendable permission codes. The last active manager cannot be removed. See the service schemas when extending this interface.

`/settings/public` is non-financial branding. `/settings/document-defaults` supports authorized document forms. `/settings` requires settings:manage and returns company and settings; its validated PATCH includes commercial/branding values, not arbitrary schema updates. Current layout is a maintained template, not a drag-and-drop template editor.

Stock history applies date/product/category/warehouse/user/customer/type; a Worker-supplied user filter cannot widen ownership. Audit applies dates/actor/action/entity type. Commercial lists apply customer/status/search and creation date. Payment lists apply supported customer/status/user/date filters in the service. Report CSV paths are `/reports/stock.csv`, `movements.csv`, `invoices.csv`, `payments.csv`; exports stream in chunks, use a UTF-8 BOM and neutralize formula-leading cells. Stock export is a current balance snapshot; document/payment exports filter by their documented event dates, not historical inventory valuation.

Admin `/reports/dashboard` totals scan the complete filtered database, not the first page. Stock KPIs are current; movement/payment revenue use the period; outstanding totals are current outstanding debt. These are different time scopes intentionally, not an accounting-period trial balance. Worker `/reports/worker` exposes only own operations.

## Exact route inventory

| Method | Path | Source controller |
|---|---|---|
| GET | `/api/v1/audit-logs` | `apps/api/src/audit/audit.controller.ts` |
| GET | `/api/v1/auth/csrf` | `apps/api/src/auth/auth.controller.ts` |
| POST | `/api/v1/auth/login` | `apps/api/src/auth/auth.controller.ts` |
| POST | `/api/v1/auth/refresh` | `apps/api/src/auth/auth.controller.ts` |
| GET | `/api/v1/auth/me` | `apps/api/src/auth/auth.controller.ts` |
| POST | `/api/v1/auth/logout` | `apps/api/src/auth/auth.controller.ts` |
| POST | `/api/v1/auth/password-reset` | `apps/api/src/auth/auth.controller.ts` |
| POST | `/api/v1/auth/password-reset/confirm` | `apps/api/src/auth/auth.controller.ts` |
| GET | `/api/v1/customers` | `apps/api/src/customers/customers.controller.ts` |
| GET | `/api/v1/customers/:id` | `apps/api/src/customers/customers.controller.ts` |
| GET | `/api/v1/customers/:id/timeline` | `apps/api/src/customers/customers.controller.ts` |
| POST | `/api/v1/customers` | `apps/api/src/customers/customers.controller.ts` |
| PATCH | `/api/v1/customers/:id` | `apps/api/src/customers/customers.controller.ts` |
| PATCH | `/api/v1/customers/:id/archive` | `apps/api/src/customers/customers.controller.ts` |
| GET | `/api/v1/delivery-notes` | `apps/api/src/documents/delivery-notes.controller.ts` |
| GET | `/api/v1/delivery-notes/:id` | `apps/api/src/documents/delivery-notes.controller.ts` |
| POST | `/api/v1/delivery-notes` | `apps/api/src/documents/delivery-notes.controller.ts` |
| PATCH | `/api/v1/delivery-notes/:id` | `apps/api/src/documents/delivery-notes.controller.ts` |
| POST | `/api/v1/delivery-notes/:id/cancel` | `apps/api/src/documents/delivery-notes.controller.ts` |
| GET | `/api/v1/delivery-notes/:id/pdf` | `apps/api/src/documents/delivery-notes.controller.ts` |
| POST | `/api/v1/delivery-notes/:id/email` | `apps/api/src/documents/delivery-notes.controller.ts` |
| GET | `/api/v1/delivery-notes/:id/email` | `apps/api/src/documents/delivery-notes.controller.ts` |
| POST | `/api/v1/delivery-notes/:id/confirm` | `apps/api/src/documents/delivery-notes.controller.ts` |
| POST | `/api/v1/delivery-notes/:id/deliver` | `apps/api/src/documents/delivery-notes.controller.ts` |
| POST | `/api/v1/delivery-notes/:id/to-invoice` | `apps/api/src/documents/delivery-notes.controller.ts` |
| GET | `/api/v1/invoices` | `apps/api/src/documents/invoices.controller.ts` |
| GET | `/api/v1/invoices/:id` | `apps/api/src/documents/invoices.controller.ts` |
| POST | `/api/v1/invoices` | `apps/api/src/documents/invoices.controller.ts` |
| PATCH | `/api/v1/invoices/:id` | `apps/api/src/documents/invoices.controller.ts` |
| POST | `/api/v1/invoices/:id/cancel` | `apps/api/src/documents/invoices.controller.ts` |
| GET | `/api/v1/invoices/:id/pdf` | `apps/api/src/documents/invoices.controller.ts` |
| POST | `/api/v1/invoices/:id/email` | `apps/api/src/documents/invoices.controller.ts` |
| GET | `/api/v1/invoices/:id/email` | `apps/api/src/documents/invoices.controller.ts` |
| POST | `/api/v1/invoices/:id/issue` | `apps/api/src/documents/invoices.controller.ts` |
| GET | `/api/v1/quotes` | `apps/api/src/documents/quotes.controller.ts` |
| GET | `/api/v1/quotes/:id` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes` | `apps/api/src/documents/quotes.controller.ts` |
| PATCH | `/api/v1/quotes/:id` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/cancel` | `apps/api/src/documents/quotes.controller.ts` |
| GET | `/api/v1/quotes/:id/pdf` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/email` | `apps/api/src/documents/quotes.controller.ts` |
| GET | `/api/v1/quotes/:id/email` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/send` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/accept` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/reject` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/duplicate` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/to-invoice` | `apps/api/src/documents/quotes.controller.ts` |
| POST | `/api/v1/quotes/:id/to-delivery-note` | `apps/api/src/documents/quotes.controller.ts` |
| GET | `/api/v1/health` | `apps/api/src/health/health.controller.ts` |
| GET | `/api/v1/health/ready` | `apps/api/src/health/health.controller.ts` |
| GET | `/api/v1/payments` | `apps/api/src/payments/payments.controller.ts` |
| POST | `/api/v1/payments` | `apps/api/src/payments/payments.controller.ts` |
| POST | `/api/v1/payments/:id/cancel` | `apps/api/src/payments/payments.controller.ts` |
| POST | `/api/v1/files/images` | `apps/api/src/pdf/files.controller.ts` |
| GET | `/api/v1/files/:id` | `apps/api/src/pdf/files.controller.ts` |
| GET | `/api/v1/categories` | `apps/api/src/products/categories.controller.ts` |
| POST | `/api/v1/categories` | `apps/api/src/products/categories.controller.ts` |
| GET | `/api/v1/products` | `apps/api/src/products/products.controller.ts` |
| POST | `/api/v1/products` | `apps/api/src/products/products.controller.ts` |
| GET | `/api/v1/products/:id` | `apps/api/src/products/products.controller.ts` |
| PATCH | `/api/v1/products/:id` | `apps/api/src/products/products.controller.ts` |
| PATCH | `/api/v1/products/:id/archive` | `apps/api/src/products/products.controller.ts` |
| GET | `/api/v1/warehouses` | `apps/api/src/products/warehouses.controller.ts` |
| POST | `/api/v1/warehouses` | `apps/api/src/products/warehouses.controller.ts` |
| GET | `/api/v1/reports/worker` | `apps/api/src/reports/reports.controller.ts` |
| GET | `/api/v1/reports/dashboard` | `apps/api/src/reports/reports.controller.ts` |
| GET | `/api/v1/reports/:report.csv` | `apps/api/src/reports/reports.controller.ts` |
| GET | `/api/v1/settings/public` | `apps/api/src/settings/settings.controller.ts` |
| GET | `/api/v1/settings/document-defaults` | `apps/api/src/settings/settings.controller.ts` |
| GET | `/api/v1/settings` | `apps/api/src/settings/settings.controller.ts` |
| PATCH | `/api/v1/settings` | `apps/api/src/settings/settings.controller.ts` |
| GET | `/api/v1/scan/:code` | `apps/api/src/stock/scan.controller.ts` |
| POST | `/api/v1/scan/withdraw` | `apps/api/src/stock/scan.controller.ts` |
| GET | `/api/v1/stock-movements` | `apps/api/src/stock/stock.controller.ts` |
| GET | `/api/v1/stock-movements/incidents` | `apps/api/src/stock/stock.controller.ts` |
| POST | `/api/v1/stock-movements/incidents/:id/resolve` | `apps/api/src/stock/stock.controller.ts` |
| POST | `/api/v1/stock-movements` | `apps/api/src/stock/stock.controller.ts` |
| POST | `/api/v1/stock-movements/:id/reverse` | `apps/api/src/stock/stock.controller.ts` |
| POST | `/api/v1/stock-movements/:id/report` | `apps/api/src/stock/stock.controller.ts` |
| GET | `/api/v1/roles` | `apps/api/src/users/roles.controller.ts` |
| GET | `/api/v1/roles/permissions` | `apps/api/src/users/roles.controller.ts` |
| POST | `/api/v1/roles` | `apps/api/src/users/roles.controller.ts` |
| GET | `/api/v1/users` | `apps/api/src/users/users.controller.ts` |
| POST | `/api/v1/users` | `apps/api/src/users/users.controller.ts` |
| PATCH | `/api/v1/users/:id` | `apps/api/src/users/users.controller.ts` |
| PATCH | `/api/v1/users/:id/deactivate` | `apps/api/src/users/users.controller.ts` |
