export const QuoteStatuses = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED"
] as const;

export const InvoiceStatuses = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED"
] as const;

export const DeliveryNoteStatuses = ["DRAFT", "CONFIRMED", "DELIVERED", "CANCELLED"] as const;

export type QuoteStatus = (typeof QuoteStatuses)[number];
export type InvoiceStatus = (typeof InvoiceStatuses)[number];
export type DeliveryNoteStatus = (typeof DeliveryNoteStatuses)[number];

const quoteTransitions: Record<QuoteStatus, readonly QuoteStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: ["CANCELLED"],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: []
};

const invoiceTransitions: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "OVERDUE", "CANCELLED"],
  PAID: ["CANCELLED"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "CANCELLED"],
  CANCELLED: []
};

const deliveryNoteTransitions: Record<DeliveryNoteStatus, readonly DeliveryNoteStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["CANCELLED"],
  CANCELLED: []
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return quoteTransitions[from].includes(to);
}

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return invoiceTransitions[from].includes(to);
}

export function canTransitionDeliveryNote(
  from: DeliveryNoteStatus,
  to: DeliveryNoteStatus
): boolean {
  return deliveryNoteTransitions[from].includes(to);
}

export function effectiveInvoiceStatus(status: InvoiceStatus, remaining: string, due: Date | string | null, now = new Date()): InvoiceStatus {
  return ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(status) && /[1-9]/.test(remaining) && due !== null && new Date(due).getTime() < now.getTime() ? "OVERDUE" : status;
}
export function effectiveQuoteStatus(status: QuoteStatus, expiry: Date | string | null, now = new Date()): QuoteStatus {
  return status === "SENT" && expiry !== null && new Date(expiry).getTime() < now.getTime() ? "EXPIRED" : status;
}
export function formatDocumentNumber(prefix: string, year: number, number: number): string {
  if (!/^[A-Z][A-Z0-9-]{0,11}$/.test(prefix) || !Number.isSafeInteger(year) || year < 2000 || year > 9999 || !Number.isSafeInteger(number) || number < 1) throw new Error("Sequence invalide.");
  return `${prefix}-${year}-${String(number).padStart(4, "0")}`;
}
