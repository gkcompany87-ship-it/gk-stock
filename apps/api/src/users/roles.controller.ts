import { Body, Controller, Get, Post } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { UsersService } from "./users.service.js";
@Controller({ path: "roles", version: "1" })
@RequirePermissions(Permissions.UserManage)
export class RolesController {
  constructor(private readonly users: UsersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.users.roles(user); }
  @Get("permissions") permissions() { return Object.values(Permissions); }
  @Post() save(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.users.saveRole(user, body); }
}
