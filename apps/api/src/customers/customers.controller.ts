import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { CustomersService } from "./customers.service.js";
@Controller({ path: "customers", version: "1" }) @RequirePermissions(Permissions.CustomerManage)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.customers.list(user, query); }
  @Get(":id") get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.customers.get(user, id); }
  @Get(":id/timeline") timeline(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: unknown) { return this.customers.timeline(user, id, query); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.customers.save(user, body); }
  @Patch(":id") update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.customers.save(user, body, id); }
  @Patch(":id/archive") archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.customers.archive(user, id); }
}
