import { z } from "zod";
import { scaled, MAX_DECIMAL_UNITS } from "./money.js";
import { StockMovementTypes } from "./stock.js";
export const idSchema = z.string().trim().min(1).max(100);
export const idempotencyKeySchema = z.string().min(8).max(180).regex(/^[a-zA-Z0-9_.:-]+$/);
export const moneyStringSchema = z.string().regex(/^\d{1,11}(?:\.\d{1,3})?$/, "Utilisez un nombre positif avec au maximum 3 decimales.").refine(value => scaled(value) <= MAX_DECIMAL_UNITS, "Valeur hors limite.");
export const positiveQuantitySchema = moneyStringSchema.refine(value => scaled(value) > 0n, "La quantite doit etre positive.");
export const rateSchema = z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/).refine(value => scaled(value, 2) <= 10_000n, "Le taux doit etre entre 0 et 100.");
const shortText = z.string().trim().max(250);
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).optional(), sortBy: z.string().max(40).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  productId: idSchema.optional(), categoryId: idSchema.optional(), userId: idSchema.optional(),
  customerId: idSchema.optional(), warehouseId: idSchema.optional(),
  status: z.string().max(40).optional(), type: z.string().max(40).optional(),
  dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional(),
  entityType: z.string().max(60).optional(), action: z.string().max(100).optional()
}).strict().refine(q => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, "Plage de dates invalide.");
export type ListQuery = z.infer<typeof paginationQuerySchema>;
export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(80), barcode: z.string().trim().min(1).max(150).optional(),
  name: z.string().trim().min(2).max(200), description: z.string().trim().max(4000).optional(),
  categoryId: idSchema.optional(), unit: z.string().trim().min(1).max(30).default("piece"),
  purchasePrice: moneyStringSchema, sellingPrice: moneyStringSchema,
  taxRate: rateSchema.default("19"), minimumStock: moneyStringSchema.default("0"),
  location: shortText.optional(), imageAssetId: idSchema.optional()
}).strict();
export const stockMovementSchema = z.object({
  productId: idSchema, warehouseId: idSchema, type: z.enum(StockMovementTypes),
  quantity: positiveQuantitySchema, direction: z.enum(["IN", "OUT"]).optional(),
  customerId: idSchema.optional(), note: z.string().trim().max(1000).optional(),
  idempotencyKey: idempotencyKeySchema
}).strict();
export const customerSchema = z.object({
  type: z.enum(["COMPANY", "INDIVIDUAL"]), companyName: shortText.optional(),
  contactName: z.string().trim().min(2).max(200), taxIdentificationNumber: shortText.optional(),
  email: z.string().email().max(254).optional(), phone: z.string().max(50).optional(),
  billingAddress: z.string().trim().max(2000).optional(), deliveryAddress: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(4000).optional(), active: z.boolean().optional()
}).strict().refine(input => input.type !== "COMPANY" || !!input.companyName?.trim(), "La raison sociale est requise.");
export const documentLineSchema = z.object({
  productId: idSchema.optional(), description: z.string().trim().min(1).max(2000),
  quantity: positiveQuantitySchema, unit: z.string().trim().min(1).max(30), unitPrice: moneyStringSchema,
  discountRate: rateSchema.default("0"), taxRate: rateSchema.default("19")
}).strict();
export const documentSchema = z.object({
  customerId: idSchema, issueDate: z.coerce.date().optional(), dueDate: z.coerce.date().optional(),
  warehouseId: idSchema.optional(), notes: z.string().trim().max(8000).optional(),
  terms: z.string().trim().max(8000).optional(), documentDiscountRate: rateSchema.default("0"),
  lines: z.array(documentLineSchema).min(1).max(200)
}).strict();
export const paymentSchema = z.object({
  invoiceId: idSchema, amount: positiveQuantitySchema,
  method: z.enum(["CASH", "BANK_TRANSFER", "CHECK", "CARD", "OTHER"]),
  reference: z.string().trim().max(250).optional(), notes: z.string().trim().max(2000).optional(),
  paidAt: z.coerce.date().optional(), idempotencyKey: idempotencyKeySchema
}).strict();
export const reasonSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();

export const paginationSchema = paginationQuerySchema;
