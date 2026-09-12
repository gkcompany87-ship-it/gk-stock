/** Exact base-10 arithmetic. One TND = 1,000 millimes. Never pass monetary JS numbers. */
export type DecimalSource = string;
export const MAX_DECIMAL_UNITS = 99_999_999_999_999n; // PostgreSQL DECIMAL(14,3).

export function roundFraction(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Denominator must be positive.");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  return sign * ((absolute + denominator / 2n) / denominator);
}

export function scaled(value: string, precision = 3): bigint {
  if (typeof value !== "string" || value.length > 80 || !/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new Error("Valeur decimale invalide. Utilisez une chaine decimale.");
  }
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) throw new Error("Invalid precision.");
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer = "0", fraction = ""] = unsigned.split(".");
  const factor = 10n ** BigInt(precision);
  const kept = fraction.slice(0, precision).padEnd(precision, "0");
  let result = BigInt(integer) * factor + BigInt(kept || "0");
  if ((fraction[precision] ?? "0") >= "5") result += 1n;
  return negative ? -result : result;
}

export function formatScaled(value: bigint, precision = 3): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const factor = 10n ** BigInt(precision);
  return `${negative ? "-" : ""}${absolute / factor}${precision ? `.${(absolute % factor).toString().padStart(precision, "0")}` : ""}`;
}
export function formatMoney(value: string): string { return formatScaled(scaled(value)); }
export function moneyLabel(value: string, currency = "TND"): string {
  const [whole = "0", fraction = "000"] = formatMoney(value).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")},${fraction} ${currency}`;
}
export function assertDatabaseRange(value: bigint): void {
  if (value > MAX_DECIMAL_UNITS || value < -MAX_DECIMAL_UNITS) throw new Error("Montant ou quantite hors limite.");
}
function rate(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Taux invalide.");
  const result = scaled(value, 2);
  if (result < 0n || result > 10_000n) throw new Error("Le taux doit etre compris entre 0 et 100.");
  return result;
}
function nonnegative(value: string, label: string): bigint {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) throw new Error(`${label}: au maximum 3 decimales.`);
  const result = scaled(value);
  assertDatabaseRange(result);
  return result;
}
export interface LineCalculationInput {
  quantity: string; unitPrice: string; discountRate?: string; taxRate?: string;
}
export interface LineCalculation {
  quantity: string; unitPrice: string; discountRate: string; taxRate: string;
  subtotal: string; discountAmount: string; documentDiscountAmount: string;
  taxableAmount: string; taxAmount: string; total: string;
}
export interface DocumentCalculationInput { lines: LineCalculationInput[]; documentDiscountRate?: string; }
export interface DocumentCalculation {
  lines: LineCalculation[]; subtotal: string; discountAmount: string;
  documentDiscountAmount: string; taxableAmount: string; taxAmount: string; total: string;
}
export function calculateLine(input: LineCalculationInput): LineCalculation {
  const quantity = nonnegative(input.quantity, "Quantite");
  const price = nonnegative(input.unitPrice, "Prix");
  if (quantity <= 0n) throw new Error("La quantite doit etre positive.");
  const discountRate = rate(input.discountRate ?? "0");
  const taxRate = rate(input.taxRate ?? "0");
  const subtotal = roundFraction(quantity * price, 1_000n);
  const discount = roundFraction(subtotal * discountRate, 10_000n);
  const taxable = subtotal - discount;
  const tax = roundFraction(taxable * taxRate, 10_000n);
  assertDatabaseRange(subtotal); assertDatabaseRange(taxable + tax);
  return {
    quantity: formatScaled(quantity), unitPrice: formatScaled(price),
    discountRate: formatScaled(discountRate, 2), taxRate: formatScaled(taxRate, 2),
    subtotal: formatScaled(subtotal), discountAmount: formatScaled(discount),
    documentDiscountAmount: "0.000", taxableAmount: formatScaled(taxable),
    taxAmount: formatScaled(tax), total: formatScaled(taxable + tax)
  };
}
export function calculateDocument(input: DocumentCalculationInput): DocumentCalculation {
  if (!input.lines.length || input.lines.length > 200) throw new Error("Un document doit contenir de 1 a 200 lignes.");
  const lines = input.lines.map(calculateLine);
  const bases = lines.map(line => scaled(line.taxableAmount));
  const base = bases.reduce((sum, amount) => sum + amount, 0n);
  const globalDiscount = roundFraction(base * rate(input.documentDiscountRate ?? "0"), 10_000n);
  // Largest-remainder allocation: allocated millimes always equal the header discount.
  const shares = bases.map((amount, index) => ({
    index, allocation: base === 0n ? 0n : globalDiscount * amount / base,
    remainder: base === 0n ? 0n : globalDiscount * amount % base
  }));
  let unallocated = globalDiscount - shares.reduce((sum, share) => sum + share.allocation, 0n);
  const ordered = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const share of ordered) {
    if (unallocated === 0n) break;
    share.allocation += 1n; unallocated -= 1n;
  }
  for (const share of shares) {
    const line = lines[share.index]!;
    const taxable = bases[share.index]! - share.allocation;
    const tax = roundFraction(taxable * rate(line.taxRate), 10_000n);
    line.documentDiscountAmount = formatScaled(share.allocation);
    line.taxableAmount = formatScaled(taxable);
    line.taxAmount = formatScaled(tax);
    line.total = formatScaled(taxable + tax);
  }
  const sum = (field: keyof Pick<LineCalculation, "subtotal" | "discountAmount" | "taxableAmount" | "taxAmount" | "total">) => lines.reduce((acc, line) => acc + scaled(line[field]), 0n);
  const total = sum("total");
  for (const value of [total, sum("subtotal"), sum("discountAmount") + globalDiscount, globalDiscount, sum("taxableAmount"), sum("taxAmount")]) assertDatabaseRange(value);
  return {
    lines, subtotal: formatScaled(sum("subtotal")),
    discountAmount: formatScaled(sum("discountAmount") + globalDiscount),
    documentDiscountAmount: formatScaled(globalDiscount),
    taxableAmount: formatScaled(sum("taxableAmount")),
    taxAmount: formatScaled(sum("taxAmount")), total: formatScaled(total)
  };
}
export function calculatePayment(total: string, paid: string, amount: string) {
  const payment = nonnegative(amount, "Paiement");
  const totalUnits = nonnegative(total, "Total");
  const paidUnits = nonnegative(paid, "Montant paye");
  if (payment <= 0n) throw new Error("Le montant du paiement doit etre positif.");
  if (paidUnits + payment > totalUnits) throw new Error("Le paiement depasse le solde restant.");
  return { paidAmount: formatScaled(paidUnits + payment), remainingAmount: formatScaled(totalUnits - paidUnits - payment), status: paidUnits + payment === totalUnits ? "PAID" as const : "PARTIALLY_PAID" as const };
}
