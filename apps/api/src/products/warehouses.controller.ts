import { Body, Controller, Get, Post } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { ProductsService } from "./products.service.js";

@Controller({ path: "warehouses", version: "1" })
export class WarehousesController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permissions.StockRead)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.products.warehouses(user);
  }

  @Post()
  @RequirePermissions(Permissions.StockAdjust)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.products.createWarehouse(user, body);
  }
}
