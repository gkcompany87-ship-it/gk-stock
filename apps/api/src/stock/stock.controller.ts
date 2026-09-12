import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { StockService } from "./stock.service.js";

@Controller({ path: "stock-movements", version: "1" })
export class StockController {
  constructor(private readonly stock: StockService) {}
  @Get("overview") @RequirePermissions(Permissions.StockRead)
  overview(@CurrentUser() user: AuthenticatedUser) { return this.stock.overview(user); }
  @Get() @RequirePermissions(Permissions.StockRead)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.stock.list(user, query); }
  @Get("incidents") @RequirePermissions(Permissions.StockRead)
  incidents(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.stock.incidents(user, query); }
  @Post("incidents/:id/resolve") @RequirePermissions(Permissions.StockAdjust)
  resolve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.stock.resolveIncident(user, id, body); }
  @Post() @RequirePermissions(Permissions.StockAdjust)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.stock.createMovement(user, body); }
  @Post(":id/reverse") @RequirePermissions(Permissions.StockAdjust)
  reverse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.stock.reverse(user, id, body); }
  @Post(":id/report") @RequirePermissions(Permissions.StockReportMistake)
  report(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.stock.reportMistake(user, id, body); }
}
