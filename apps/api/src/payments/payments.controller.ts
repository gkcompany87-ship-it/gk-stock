import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { DocumentsService } from "../documents/documents.service.js";
@Controller({ path: "payments", version: "1" }) @RequirePermissions(Permissions.PaymentManage, Permissions.FinancialRead)
export class PaymentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) { return this.documents.listPayments(user, query); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.documents.registerPayment(user, body); }
  @Post(":id/cancel") cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) { return this.documents.cancelPayment(user, id, body, key); }
}
