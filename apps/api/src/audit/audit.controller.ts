import { Controller, Get, Query } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { AuditService } from "./audit.service.js";
@Controller({ path: "audit-logs", version: "1" })
@RequirePermissions(Permissions.AuditRead)
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.audit.list(user, query); }
}
