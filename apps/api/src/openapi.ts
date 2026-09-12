import type { OpenAPIObject } from "@nestjs/swagger";
/** Add explicit request examples to Nest's route discovery. API validation remains Zod + services. */
export function enrichOpenApi(document: OpenAPIObject): OpenAPIObject {
  const money = { type: "string", pattern: "^\\d{1,11}(\\.\\d{1,3})?$", example: "119.000", description: "Decimal string; TND uses three decimal places. Never send a JSON number." };
  const id = { type: "string", minLength: 1, maxLength: 100 };
  const text = { type: "string" };
  const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, properties, required });
  const line = object({ productId: id, description: text, quantity: money, unit: text, unitPrice: money,
    discountRate: { type: "string", example: "0" }, taxRate: { type: "string", example: "19" } }, ["description","quantity","unit","unitPrice"]);
  const commercial = object({ customerId: id, issueDate: { type: "string", format: "date-time" }, dueDate: { type: "string", format: "date-time" }, warehouseId: id,
    notes: text, terms: text, documentDiscountRate: { type: "string", example: "0" }, lines: { type: "array", minItems: 1, maxItems: 200, items: line } }, ["customerId","lines"]);
  const schemas: Record<string, unknown> = {
    Login: object({ email: { type: "string", format: "email" }, password: { type: "string", format: "password" } }, ["email","password"]),
    ResetRequest: object({ email: { type: "string", format: "email" } }, ["email"]),
    ResetConfirm: object({ token: text, password: { type: "string", minLength: 12, format: "password" } }, ["token","password"]),
    Product: object({ sku: text, barcode: text, name: text, description: text, categoryId: id, unit: text, purchasePrice: money, sellingPrice: money, taxRate: text, minimumStock: money, location: text, imageAssetId: id }, ["sku","name","purchasePrice","sellingPrice"]),
    Customer: object({ type: { type: "string", enum: ["COMPANY","INDIVIDUAL"] }, companyName: text, contactName: text, taxIdentificationNumber: text, email: { type: "string", format: "email" }, phone: text, billingAddress: text, deliveryAddress: text, notes: text, active: { type: "boolean" } }, ["type","contactName"]),
    Commercial: commercial,
    CommercialRevision: { ...commercial, properties: { ...commercial.properties, version: { type: "integer", minimum: 1 } }, required: [...commercial.required,"version"] },
    Withdrawal: object({ code: text, warehouseId: id, quantity: money, note: text, idempotencyKey: { type: "string", format: "uuid" } }, ["code","warehouseId","quantity","idempotencyKey"]),
    Movement: object({ productId: id, warehouseId: id, type: { type: "string", enum: ["INITIAL_STOCK","ENTRY","WITHDRAWAL","RETURN","DAMAGED","ADJUSTMENT"] }, quantity: money, direction: { type: "string", enum: ["IN","OUT"] }, customerId: id, note: text, idempotencyKey: text }, ["productId","warehouseId","type","quantity","idempotencyKey"]),
    Payment: object({ invoiceId: id, amount: money, method: { type: "string", enum: ["CASH","BANK_TRANSFER","CHECK","CARD","OTHER"] }, reference: text, notes: text, paidAt: { type: "string", format: "date-time" }, idempotencyKey: text }, ["invoiceId","amount","method","idempotencyKey"]),
    Reason: object({ reason: { type: "string", minLength: 5, maxLength: 1000 } }, ["reason"]),
    Reversal: object({ reason: { type: "string", minLength: 5, maxLength: 1000 }, idempotencyKey: text }, ["reason","idempotencyKey"]),
    Incident: object({ description: { type: "string", minLength: 5, maxLength: 1000 }, idempotencyKey: text }, ["description","idempotencyKey"]),
    Resolution: object({ resolution: { type: "string", minLength: 5, maxLength: 1000 } }, ["resolution"]),
    Category: object({ name: { type: "string", minLength: 2, maxLength: 120 } }, ["name"]),
    Warehouse: object({ code: text, name: text, location: text }, ["code","name"]),
    Error: object({ error: object({ status: { type: "integer" }, code: text, message: text, requestId: text }), requestId: text }, ["error","requestId"])
  };
  document.components ??= {};
  document.components.schemas = { ...document.components.schemas, ...schemas } as NonNullable<OpenAPIObject["components"]>["schemas"];
  const schemaByPath: Record<string,string> = { "auth/login":"Login", "auth/password-reset":"ResetRequest", "auth/password-reset/confirm":"ResetConfirm", products:"Product", customers:"Customer", quotes:"Commercial", invoices:"Commercial", "delivery-notes":"Commercial", "scan/withdraw":"Withdrawal", "stock-movements":"Movement", payments:"Payment", categories:"Category", warehouses:"Warehouse" };
  for (const [path, entry] of Object.entries(document.paths)) {
    const relative=path.replace(/^\/api\/v1\//,"");
    for (const method of ["get","post","patch","put","delete"] as const) {
      const operation=entry?.[method]; if (!operation) continue;
      const publicRoute=relative.startsWith("health")||["auth/csrf","auth/login","auth/refresh","auth/password-reset","auth/password-reset/confirm"].includes(relative);
      operation.security=publicRoute?[]:[{cookie:[]}];
      operation.responses ??= {};
      for (const code of ["400","401","403","409","429","503"]) operation.responses[code] ??= { description:"Request refused; see stable error envelope and requestId.", content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}} };
      if (method==="get") continue;
      operation.parameters ??= [];
      operation.parameters.push({name:"X-CSRF-Token",in:"header",required:true,description:"Fetch /auth/csrf with the same cookie jar first.",schema:{type:"string"}});
      if (/^(quotes|invoices|delivery-notes)(\/|$)/.test(relative)||/^payments\/.+\/cancel$/.test(relative)) operation.parameters.push({name:"Idempotency-Key",in:"header",required:true,schema:{type:"string",minLength:8,maxLength:180}});
      let name=schemaByPath[relative];
      if (/^(quotes|invoices|delivery-notes)\/[^/]+$/.test(relative)&&method==="patch") name="CommercialRevision";
      if (relative.endsWith("/cancel")) name="Reason";
      if (relative.startsWith("stock-movements/")&&relative.endsWith("/reverse")) name="Reversal";
      if (relative.startsWith("stock-movements/")&&relative.endsWith("/report")) name="Incident";
      if (relative.startsWith("stock-movements/incidents/")&&relative.endsWith("/resolve")) name="Resolution";
      if(name) operation.requestBody={required:true,content:{"application/json":{schema:{$ref:`#/components/schemas/${name}`}}}};
    }
  }
  return document;
}
