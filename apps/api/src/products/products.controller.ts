import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { ProductsService } from "./products.service.js";

@Controller({ path: "products", version: "1" })
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permissions.ProductRead)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.products.list(user, query);
  }

  @Post()
  @RequirePermissions(Permissions.ProductWrite)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.products.create(user, body);
  }

  @Get(":id")
  @RequirePermissions(Permissions.ProductRead)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.products.get(user, id);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.ProductWrite)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) {
    return this.products.update(user, id, body);
  }

  @Patch(":id/archive")
  @RequirePermissions(Permissions.ProductWrite)
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.products.archive(user, id);
  }
}
