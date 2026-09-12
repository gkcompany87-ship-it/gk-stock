import { Permissions, scaled, formatScaled } from "@as-tino/shared";
import type { AuthenticatedUser } from "../common/current-user.js";
export function productDto<T extends { purchasePrice: unknown; sellingPrice: unknown; taxRate: unknown; minimumStock: { toString(): string }; imageAssetId?: string | null; balances?: { quantity: { toString(): string } }[] }>(actor: AuthenticatedUser, product: T) {
  const financial = actor.permissions.includes(Permissions.FinancialRead);
  const quantity = (product.balances ?? []).reduce((sum, balance) => sum + scaled(balance.quantity.toString()), 0n);
  return { ...product, purchasePrice: financial ? product.purchasePrice : undefined, sellingPrice: financial ? product.sellingPrice : undefined,
    taxRate: financial ? product.taxRate : undefined, currentQuantity: formatScaled(quantity), quantity: formatScaled(quantity), lowStock: quantity <= scaled(product.minimumStock.toString()),
    imageUrl: product.imageAssetId ? `/api/v1/files/${product.imageAssetId}` : null };
}
