import { Injectable, NotFoundException } from "@nestjs/common";
import { customerSchema, paginationQuerySchema, Permissions } from "@as-tino/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { assertCan } from "../common/access.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async list(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.CustomerManage); const q = paginationQuerySchema.parse(raw);
    const where: Prisma.CustomerWhereInput = { companyId: actor.companyId, active: q.status === "ARCHIVED" ? false : true,
      OR: q.search ? ["contactName", "companyName", "email", "phone"].map(field => ({ [field]: { contains: q.search, mode: "insensitive" } })) : undefined };
    const [items, total] = await this.prisma.$transaction([this.prisma.customer.findMany({ where, include: { addresses: true }, skip: (q.page-1)*q.pageSize, take: q.pageSize, orderBy: { updatedAt: q.sortDirection } }), this.prisma.customer.count({ where })]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async get(actor: AuthenticatedUser, id: string) {
    assertCan(actor, Permissions.CustomerManage);
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId: actor.companyId }, include: { addresses: true } });
    if (!customer) throw new NotFoundException("Client introuvable.");
    return customer;
  }
  async save(actor: AuthenticatedUser, body: unknown, id?: string) {
    assertCan(actor, Permissions.CustomerManage); const input = customerSchema.parse(body);
    const { billingAddress, deliveryAddress, ...data } = input;
    return this.prisma.$transaction(async tx => {
      let before;
      if (id) {
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${id} AND "companyId"=${actor.companyId} FOR UPDATE`;
        before = await tx.customer.findFirst({ where: { id, companyId: actor.companyId } });
        if (!before) throw new NotFoundException("Client introuvable.");
        await tx.address.deleteMany({ where: { customerId: id, companyId: actor.companyId } });
      }
      const addresses = { create: [
        ...(billingAddress ? [{ companyId: actor.companyId, kind: "BILLING" as const, rawText: billingAddress }] : []),
        ...(deliveryAddress ? [{ companyId: actor.companyId, kind: "DELIVERY" as const, rawText: deliveryAddress }] : []) ] };
      const customer = id ? await tx.customer.update({ where: { id }, data: { ...data, addresses }, include: { addresses: true } }) :
        await tx.customer.create({ data: { ...data, companyId: actor.companyId, addresses }, include: { addresses: true } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: id ? "customer.updated" : "customer.created", entityType: "Customer", entityId: customer.id,
        before: before ? { name: before.companyName ?? before.contactName, active: before.active } : undefined,
        after: { name: customer.companyName ?? customer.contactName, active: customer.active } }, tx);
      return customer;
    });
  }
  async archive(actor: AuthenticatedUser, id: string) {
    assertCan(actor, Permissions.CustomerManage);
    return this.prisma.$transaction(async tx => {
      const result = await tx.customer.updateMany({ where: { id, companyId: actor.companyId }, data: { active: false } });
      if (!result.count) throw new NotFoundException("Client introuvable.");
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "customer.archived", entityType: "Customer", entityId: id }, tx);
      return { ok: true };
    });
  }
  async timeline(actor: AuthenticatedUser, customerId: string, raw: unknown) {
    assertCan(actor, Permissions.FinancialRead); await this.get(actor, customerId); const q = paginationQuerySchema.parse(raw);
    const union = Prisma.sql`
      SELECT id, 'QUOTE' AS type, COALESCE(number,"internalRef") AS number, "createdAt" AS date, total::text AS amount, status::text AS status FROM "Quote" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}
      UNION ALL SELECT id, 'INVOICE', COALESCE(number,"internalRef"), "createdAt", total::text, status::text FROM "Invoice" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}
      UNION ALL SELECT id, 'DELIVERY_NOTE', COALESCE(number,"internalRef"), "createdAt", total::text, status::text FROM "DeliveryNote" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}
      UNION ALL SELECT id, 'PAYMENT', COALESCE(reference,id), "paidAt", amount::text, CASE WHEN "cancelledAt" IS NULL THEN 'REGISTERED' ELSE 'CANCELLED' END FROM "Payment" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}`;
    const [items, count] = await this.prisma.$transaction([
      this.prisma.$queryRaw(Prisma.sql`SELECT * FROM (${union}) timeline ORDER BY date DESC, id DESC LIMIT ${q.pageSize} OFFSET ${(q.page-1)*q.pageSize}`),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM (${union}) timeline`)]);
    return { items, total: Number(count[0]?.total ?? 0), page: q.page, pageSize: q.pageSize };
  }
}
