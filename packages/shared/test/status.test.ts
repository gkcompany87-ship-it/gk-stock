import { describe, expect, it } from "vitest";
import {
  canTransitionDeliveryNote,
  canTransitionInvoice,
  canTransitionQuote
} from "../src/status.js";

describe("document status transitions", () => {
  it("allows the expected quotation lifecycle", () => {
    expect(canTransitionQuote("DRAFT", "SENT")).toBe(true);
    expect(canTransitionQuote("ACCEPTED", "SENT")).toBe(false);
  });

  it("does not allow silently editing issued invoices back to draft", () => {
    expect(canTransitionInvoice("ISSUED", "DRAFT")).toBe(false);
    expect(canTransitionInvoice("ISSUED", "PAID")).toBe(true);
  });

  it("allows cancelling a confirmed delivery note with reversal movements", () => {
    expect(canTransitionDeliveryNote("CONFIRMED", "CANCELLED")).toBe(true);
  });
});
