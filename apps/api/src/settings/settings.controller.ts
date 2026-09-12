import { Body, Controller, Get, Patch } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { SettingsService } from "./settings.service.js";
@Controller({ path: "settings", version: "1" })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get("public") @RequirePermissions(Permissions.DashboardRead)
  publicInfo(@CurrentUser() user: AuthenticatedUser) { return this.settings.publicInfo(user); }
  @Get("document-defaults") @RequirePermissions(Permissions.DocumentManage, Permissions.FinancialRead)
  defaults(@CurrentUser() user: AuthenticatedUser) { return this.settings.documentDefaults(user); }
  @Get() @RequirePermissions(Permissions.SettingsManage)
  get(@CurrentUser() user: AuthenticatedUser) { return this.settings.get(user); }
  @Patch() @RequirePermissions(Permissions.SettingsManage)
  update(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.settings.update(user, body); }
}
