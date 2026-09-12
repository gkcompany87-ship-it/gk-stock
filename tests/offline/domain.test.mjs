import test from "node:test";
import assert from "node:assert/strict";
import { calculateDocument, calculateLine, calculatePayment, formatMoney, moneyLabel, scaled } from "../../.local/offline-build/money.js";
import { assertStockAvailable, signedStockDelta, reversalDelta } from "../../.local/offline-build/stock.js";
import { ROLE_PERMISSIONS, Permissions } from "../../.local/offline-build/permissions.js";
import { canTransitionQuote, canTransitionInvoice, canTransitionDeliveryNote, formatDocumentNumber, effectiveInvoiceStatus } from "../../.local/offline-build/status.js";

test("TND half-up rounding, including negative half values", () => {
 assert.equal(formatMoney("1.2345"), "1.235"); assert.equal(formatMoney("-1.2345"), "-1.235");
 assert.equal(formatMoney("0.0004"), "0.000"); assert.equal(moneyLabel("1234567.890"), "1\u202f234\u202f567,890 TND");
});
test("quantity, line discount and 19 percent tax", () => {
 assert.deepEqual(calculateLine({ quantity: "2", unitPrice: "100", discountRate: "10", taxRate: "19" }), {
 quantity: "2.000", unitPrice: "100.000", discountRate: "10.00", taxRate: "19.00", subtotal: "200.000", discountAmount: "20.000", documentDiscountAmount: "0.000", taxableAmount: "180.000", taxAmount: "34.200", total: "214.200" });
});
test("regression: add all line taxes instead of weighted tax", () => {
 const result = calculateDocument({ lines: [{ quantity: "1", unitPrice: "100", taxRate: "19" }, { quantity: "1", unitPrice: "100", taxRate: "19" }] });
 assert.equal(result.taxAmount, "38.000"); assert.equal(result.total, "238.000");
});
test("global discount allocates exact millimes and uses discounted tax bases", () => {
 const result = calculateDocument({ documentDiscountRate: "5", lines: [{ quantity: "3", unitPrice: "12.333", taxRate: "19" }, { quantity: "2", unitPrice: "9.999", discountRate: "10", taxRate: "7" }] });
 assert.equal(result.total, "60.122");
 assert.equal(result.lines.reduce((s, line) => s + scaled(line.total), 0n), scaled(result.total));
 assert.equal(result.lines.reduce((s, line) => s + scaled(line.documentDiscountAmount), 0n), scaled(result.documentDiscountAmount));
});
test("rounding allocation invariant across 400 deterministic multi-rate documents", () => {
 for (let i = 1; i <= 400; i++) {
  const lines = ["0", "7", "13", "19"].map((taxRate, index) => ({ quantity: `${1 + index}.${String(i % 1000).padStart(3, "0")}`, unitPrice: `${i}.${String((i * 13) % 1000).padStart(3, "0")}`, discountRate: `${i % 29}`, taxRate }));
  const result = calculateDocument({ lines, documentDiscountRate: `${i % 101}` });
  const sum = field => result.lines.reduce((acc, line) => acc + scaled(line[field]), 0n);
  assert.equal(sum("total"), scaled(result.total));
  assert.equal(sum("taxAmount"), scaled(result.taxAmount));
  assert.equal(scaled(result.subtotal) - scaled(result.discountAmount) + scaled(result.taxAmount), scaled(result.total));
  assert.equal(sum("documentDiscountAmount"), scaled(result.documentDiscountAmount));
 }
});
test("zero prices and full discounts have zero tax", () => {
 assert.equal(calculateDocument({ lines: [{ quantity: "2", unitPrice: "0", taxRate: "19" }] }).total, "0.000");
 assert.equal(calculateDocument({ documentDiscountRate: "100", lines: [{ quantity: "2", unitPrice: "99", taxRate: "19" }] }).total, "0.000");
});
test("invalid, non-finite, overflowing and floating-point money is rejected", () => {
 for (const unitPrice of ["NaN", "Infinity", "-1", "1e3", "1.0001", "999999999999.000", 1.2]) assert.throws(() => calculateLine({ quantity: "1", unitPrice }));
 assert.throws(() => calculateLine({ quantity: "0", unitPrice: "1" }));
 assert.throws(() => calculateDocument({ lines: [] }));
 assert.throws(() => calculateLine({ quantity: "1", unitPrice: "1", taxRate: "101" }));
});
test("payment balance and overpayment prevention", () => {
 assert.deepEqual(calculatePayment("119", "20", "99"), { paidAmount: "119.000", remainingAmount: "0.000", status: "PAID" });
 assert.equal(calculatePayment("119", "0", "20").remainingAmount, "99.000");
 assert.throws(() => calculatePayment("10", "9", "2"));
 assert.throws(() => calculatePayment("10", "0", "0"));
});
test("stock deltas, explicit adjustments and compensating reversals", () => {
 assert.equal(signedStockDelta("WITHDRAWAL", "3"), "-3.000");
 assert.equal(signedStockDelta("ENTRY", "3"), "3.000");
 assert.equal(signedStockDelta("ADJUSTMENT", "1.250", "OUT"), "-1.250");
 assert.equal(reversalDelta("10", "7"), "3.000");
 assert.equal(reversalDelta("7", "10"), "-3.000");
 assert.throws(() => signedStockDelta("CANCELLATION_REVERSAL", "1"));
 assert.throws(() => signedStockDelta("ADJUSTMENT", "1"));
});
test("negative stock is rejected unless explicitly enabled", () => {
 assert.throws(() => assertStockAvailable("2", "-3", false));
 assert.doesNotThrow(() => assertStockAvailable("2", "-3", true));
 assert.doesNotThrow(() => assertStockAvailable("0.003", "-0.003", false));
});
test("workers cannot gain financial or global-history permissions", () => {
 assert.ok(ROLE_PERMISSIONS.WORKER.includes(Permissions.StockWithdraw));
 assert.ok(ROLE_PERMISSIONS.WORKER.includes(Permissions.StockReportMistake));
 for (const permission of [Permissions.UserManage, Permissions.StockAdjust, Permissions.StockReadAll, Permissions.FinancialRead]) assert.ok(!ROLE_PERMISSIONS.WORKER.includes(permission));
});
test("document transitions do not reopen issued invoices", () => {
 assert.ok(canTransitionQuote("DRAFT", "SENT")); assert.ok(!canTransitionQuote("ACCEPTED", "SENT"));
 assert.ok(!canTransitionInvoice("ISSUED", "DRAFT")); assert.ok(canTransitionDeliveryNote("CONFIRMED", "CANCELLED"));
});
test("number formatting validates prefixes and sequence values", () => {
 assert.equal(formatDocumentNumber("FAC", 2026, 1), "FAC-2026-0001");
 assert.equal(formatDocumentNumber("DEV", 2027, 12000), "DEV-2027-12000");
 assert.throws(() => formatDocumentNumber("../FAC", 2026, 1));
 assert.throws(() => formatDocumentNumber("FAC", 2026, 0));
});
test("overdue is derived without changing cancelled or draft invoices", () => {
 const now = new Date("2026-09-10T12:00:00Z");
 assert.equal(effectiveInvoiceStatus("ISSUED", "10.000", "2026-09-01", now), "OVERDUE");
 assert.equal(effectiveInvoiceStatus("CANCELLED", "10.000", "2026-09-01", now), "CANCELLED");
});

test("fully discounted document still rejects overflowing header subtotal", () => {
 assert.throws(() => calculateDocument({ documentDiscountRate: "100", lines: [
 { quantity: "1", unitPrice: "99999999999.999", taxRate: "0" },
 { quantity: "1", unitPrice: "1.000", taxRate: "0" }] }));
});
