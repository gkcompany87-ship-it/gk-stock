import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { Readable } from "node:stream";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { ReportsService } from "./reports.service.js";
@Controller({ path: "reports", version: "1" })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("worker") @RequirePermissions(Permissions.DashboardRead)
  worker(@CurrentUser() user: AuthenticatedUser) { return this.reports.worker(user); }
  @Get("dashboard") @RequirePermissions(Permissions.ReportRead, Permissions.FinancialRead)
  dashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.reports.dashboard(user, query); }
  @Get(":report.csv") @RequirePermissions(Permissions.ReportRead, Permissions.FinancialRead)
  async export(@CurrentUser() user: AuthenticatedUser, @Param("report") report: string, @Query() query: unknown, @Res() reply: FastifyReply) {
    const name = z.enum(["stock","movements","invoices","payments"]).parse(report);
    const generator = this.reports.csv(user, name, query);
    // Validate permissions and filters before HTTP headers are committed.
    const first = await generator.next();
    async function* stream() { if (!first.done) yield first.value; yield* generator; }
    return reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="as-tino-${name}.csv"`).send(Readable.from(stream()));
  }
}
