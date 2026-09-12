import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { idSchema, idempotencyKeySchema, Permissions, positiveQuantitySchema } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { ProductsService } from "../products/products.service.js";
import { StockService } from "./stock.service.js";
const withdrawSchema = z.object({ code: z.string().trim().min(1).max(150), quantity: positiveQuantitySchema,
  warehouseId: idSchema, idempotencyKey: idempotencyKeySchema, note: z.string().max(1000).optional() }).strict();
@Controller({ path: "scan", version: "1" })
export class ScanController {
  constructor(private readonly products: ProductsService, private readonly stock: StockService) {}
  @Get(":code") @RequirePermissions(Permissions.ProductRead)
  find(@CurrentUser() user: AuthenticatedUser, @Param("code") code: string) { return this.products.findByCode(user, code); }
  @Post("withdraw") @RequirePermissions(Permissions.StockWithdraw)
  async withdraw(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = withdrawSchema.parse(body); const product = await this.products.findByCode(user, input.code);
    return this.stock.createMovement(user, { productId: product.id, warehouseId: input.warehouseId, type: "WITHDRAWAL",
      quantity: input.quantity, note: input.note ?? "Sortie confirmee depuis le scanner", idempotencyKey: input.idempotencyKey });
  }
}
