import { Body, Controller, HttpCode, Get, Headers, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { DocumentsService } from "./documents.service.js";
import { DocumentPdfService } from "../pdf/document-pdf.service.js";
@ApiTags("quotes")
@Controller({ path: "quotes", version: "1" }) @RequirePermissions(Permissions.DocumentManage, Permissions.FinancialRead)
export class QuotesController {
  constructor(private readonly documents: DocumentsService, private readonly pdf: DocumentPdfService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.documents.list(user, "QUOTE", query); }
  @Get(":id") get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.documents.get(user, "QUOTE", id); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown, @Headers("idempotency-key") key?: string) { return this.documents.create(user, "QUOTE", body, key); }
  @Patch(":id") update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) { return this.documents.update(user, "QUOTE", id, body, key); }
  @Post(":id/cancel") @HttpCode(200) cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) { return this.documents.cancel(user, "QUOTE", id, body, key); }
  @Get(":id/pdf") async download(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Res() reply: FastifyReply, @Query("original") original?: string) {
    const file = await this.pdf.forActor(user, "QUOTE", id, original === "1");
    return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename="${file.filename}"`).send(file.buffer);
  }
  @Post(":id/email") @HttpCode(202) email(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.queueEmail(user, "QUOTE", id, key); }
  @Get(":id/email") status(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.documents.emailStatus(user, "QUOTE", id); }
  @Post(":id/send") @HttpCode(200) issue(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.issue(user, "QUOTE", id, key); }
  @Post(":id/accept") @HttpCode(200) accept(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.transition(user, "QUOTE", id, "ACCEPTED", key); }
  @Post(":id/reject") @HttpCode(200) reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.transition(user, "QUOTE", id, "REJECTED", key); }
  @Post(":id/duplicate") duplicate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.convert(user, "QUOTE", id, "QUOTE", key); }
  @Post(":id/to-invoice") toinvoice(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.convert(user, "QUOTE", id, "INVOICE", key); }
  @Post(":id/to-delivery-note") todeliverynote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Headers("idempotency-key") key?: string) { return this.documents.convert(user, "QUOTE", id, "DELIVERY_NOTE", key); }
}
