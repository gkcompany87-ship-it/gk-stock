import { describe, expect, it } from "vitest";
import { calculateDocument, calculateLine, formatMoney } from "../src/money.js";

describe("money calculations", () => {
  it("rounds TND monetary values with 3 decimals", () => {
    expect(formatMoney("1.2345")).toBe("1.235");
  });

  it("calculates line discount and tax", () => {
    expect(
      calculateLine({
        quantity: "2",
        unitPrice: "100.000",
        discountRate: "10",
        taxRate: "19"
      })
    ).toMatchObject({
      subtotal: "200.000",
      discountAmount: "20.000",
      taxableAmount: "180.000",
      taxAmount: "34.200",
      total: "214.200"
    });
  });

  it("calculates a document discount without using floating point math", () => {
    expect(
      calculateDocument({
        documentDiscountRate: "5",
        lines: [
          { quantity: "3", unitPrice: "12.333", taxRate: "19" },
          { quantity: "2", unitPrice: "9.999", discountRate: "10", taxRate: "7" }
        ]
      }).total
    ).toBe("60.122");
  });
});
