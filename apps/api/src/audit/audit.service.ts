import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import { paginationSchema, Permissions } from "@as-tino/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requestContext } from "../common/request-context.js";
import { safeSummary } from "../common/json.js";
import { assertCan } from "../common/access.js";
import type { AuthenticatedUser } from "../common/current-user.js";
export interface AuditRecordInput {
  companyId: string; actorId?: string; action: string; entityType: string; entityId?: string;
  requestId?: string; ipAddress?: string; before?: unknown; after?: unknown; reason?: string;
}
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  async record(input: AuditRecordInput, tx: Prisma.TransactionClient = this.prisma) {
    const context = requestContext.getStore();
    await tx.auditLog.create({ data: { ...input, before: safeSummary(input.before), after: safeSummary(input.after),
      requestId: context?.requestId ?? input.requestId ?? "system", ipAddress: this.config.get("AUDIT_STORE_IP") === "true" ? context?.ipAddress ?? input.ipAddress : undefined } });
  }
  async list(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.AuditRead); const q = paginationSchema.parse(raw);
    const where: Prisma.AuditLogWhereInput = { companyId: actor.companyId, entityType: q.entityType, action: q.action,
      actorId: q.userId, createdAt: { gte: q.dateFrom, lte: q.dateTo } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: q.sortDirection ?? "desc" }, skip: (q.page-1)*q.pageSize, take: q.pageSize,
        include: { actor: { select: { id: true, name: true } } } }), this.prisma.auditLog.count({ where })]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}
