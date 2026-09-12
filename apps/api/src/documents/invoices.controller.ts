import { Body, Controller, HttpCode, Get, Headers, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { DocumentsService } from "./documents.service.js";
import { DocumentPdfService } from "../pdf/document-pdf.service.js";
@ApiTags("invoices")
@Controller({ path: "invoices", version: "1" }) @RequirePermissions(Permissions.DocumentManage, Permissions.FinancialRead)
export class InvoicesController {
  constructor(private readonly documents: DocumentsService, private readonly pdf: DocumentPdfService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.documents.list(user, "INVOICE", query); }
  @Get(":id") get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.documents.get(user, "INVOICE", id); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown, @Headers("idempotency-key") key?: string) { return this.documents.create(user, "INVOICE", body, key); }
  @Patch(":id") update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) { return this.documents.update(user, "INVOICE", id, body, key); }
  @Post(":id/cancel") @HttpCode(200) cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) { return this.documents.cancel(user, "INVOICE", id, body, key); }
  @Get(":id/pdf") async download(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Res() reply: FastifyReply, @Query("original") original?: string) {
    const file = await this.pdf.forActor(user, "INVOICE", id, original === "1");
    return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename="${file.filename}"`).send(file.buffer);
  }
  @Post(":id/email") @HttpCode(202) email(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.queueEmail(user, "INVOICE", id, key); }
  @Get(":id/email") status(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.documents.emailStatus(user, "INVOICE", id); }
  @Post(":id/issue") @HttpCode(200) issue(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.issue(user, "INVOICE", id, key); }
}
