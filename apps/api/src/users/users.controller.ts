import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { UsersService } from "./users.service.js";

@Controller({ path: "users", version: "1" })
@RequirePermissions(Permissions.UserManage)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.users.list(user, query); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.users.create(user, body); }
  @Patch(":id") update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.users.update(user, id, body); }
  @Patch(":id/deactivate") deactivate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.users.update(user, id, { status: "INACTIVE" }); }
  @Post(":id/reset-password") resetPassword(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.users.resetPassword(user, id, body); }
  @Post(":id/logout-all") logoutAll(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.users.logoutAll(user, id); }
}
