import { scaled, formatScaled, assertDatabaseRange } from "./money.js";
export const StockMovementTypes = ["INITIAL_STOCK", "ENTRY", "WITHDRAWAL", "CUSTOMER_DELIVERY", "RETURN", "DAMAGED", "ADJUSTMENT", "CANCELLATION_REVERSAL"] as const;
export type StockMovementType = (typeof StockMovementTypes)[number];
export function signedStockDelta(type: StockMovementType, quantity: string, direction?: "IN" | "OUT"): string {
  if (!/^\d+(?:\.\d{1,3})?$/.test(quantity)) throw new Error("Quantite invalide.");
  const value = scaled(quantity); assertDatabaseRange(value);
  if (value <= 0n) throw new Error("La quantite du mouvement doit etre positive.");
  if (type === "CANCELLATION_REVERSAL") throw new Error("Utilisez une inversion liee au mouvement original.");
  if (type === "ADJUSTMENT" && !direction) throw new Error("Le sens de l'ajustement est requis.");
  const outgoing = ["WITHDRAWAL", "CUSTOMER_DELIVERY", "DAMAGED"].includes(type) || (type === "ADJUSTMENT" && direction === "OUT");
  return formatScaled(outgoing ? -value : value);
}
export function assertStockAvailable(currentQuantity: string, delta: string, allowNegativeStock: boolean): void {
  const next = scaled(currentQuantity) + scaled(delta); assertDatabaseRange(next);
  if (!allowNegativeStock && next < 0n) throw new Error("Stock insuffisant pour confirmer cette operation.");
}
export function reversalDelta(before: string, after: string): string { return formatScaled(scaled(before) - scaled(after)); }
