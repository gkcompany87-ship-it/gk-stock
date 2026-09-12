import type { Prisma } from "@prisma/client";
export const documentInclude = { customer: { include: { addresses: true } }, lines: { orderBy: { position: "asc" } } } as const;
export type CommercialDocument = Prisma.QuoteGetPayload<{ include: typeof documentInclude }> |
  Prisma.InvoiceGetPayload<{ include: typeof documentInclude }> | Prisma.DeliveryNoteGetPayload<{ include: typeof documentInclude }>;
export interface DocumentSnapshot {
  version: 1; type: "QUOTE" | "INVOICE" | "DELIVERY_NOTE"; documentId: string; number: string; statusAtIssue: string;
  issueDate: string; dueDate: string | null; currency: string; locale: string; timezone: string;
  company: { name: string; legalName: string | null; taxIdentificationNumber: string | null; email: string | null; phone: string | null; address: string | null; logoAssetId: string | null };
  customer: { name: string; contactName: string; taxIdentificationNumber: string | null; email: string | null; phone: string | null; billingAddress: string; deliveryAddress: string };
  lines: { position: number; productId: string | null; description: string; quantity: string; unit: string; unitPrice: string; discountRate: string; taxRate: string; subtotal: string; discountAmount: string; documentDiscountAmount: string; taxableAmount: string; taxAmount: string; total: string }[];
  subtotal: string; discountAmount: string; documentDiscountRate: string; taxAmount: string; total: string; paidAmount: string; remainingAmount: string;
  notes: string; terms: string; footer: string;
}
