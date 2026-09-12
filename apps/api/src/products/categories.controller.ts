import { Body, Controller, Get, Post } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { ProductsService } from "./products.service.js";

@Controller({ path: "categories", version: "1" })
export class CategoriesController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permissions.ProductRead)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.products.categories(user);
  }

  @Post()
  @RequirePermissions(Permissions.ProductWrite)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.products.createCategory(user, body);
  }
}
