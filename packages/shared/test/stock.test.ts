import { describe, expect, it } from "vitest";
import { assertStockAvailable, signedStockDelta } from "../src/stock.js";

describe("stock rules", () => {
  it("uses negative deltas for worker withdrawals", () => {
    expect(signedStockDelta("WITHDRAWAL", "3").toString()).toBe("-3.000");
  });

  it("prevents negative stock unless explicitly allowed", () => {
    expect(() => assertStockAvailable("2", "-3", false)).toThrow(
      "Stock insuffisant pour confirmer cette operation."
    );
    expect(() => assertStockAvailable("2", "-3", true)).not.toThrow();
  });
});
