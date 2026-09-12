import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  customerAdjustmentSchema,
  customerSchema,
  formatScaled,
  paginationQuerySchema,
  Permissions,
  scaled
} from "@as-tino/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { assertCan } from "../common/access.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";

type FinancialAccumulator = {
  balance: bigint;
  overdueAmount: bigint;
  unpaidCount: number;
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private financialStatus(balance: bigint, overdueAmount: bigint) {
    if (balance < 0n) return "CREDIT" as const;
    if (balance === 0n) return "UP_TO_DATE" as const;
    if (overdueAmount > 0n) return "OVERDUE" as const;
    return "PENDING" as const;
  }

  private async summaries(companyId: string, customerIds: string[]) {
    const result = new Map<string, FinancialAccumulator>();
    for (const id of customerIds) {
      result.set(id, { balance: 0n, overdueAmount: 0n, unpaidCount: 0 });
    }
    if (!customerIds.length) return result;

    const [invoices, adjustments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          companyId,
          customerId: { in: customerIds },
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] }
        },
        select: { customerId: true, remainingAmount: true, dueDate: true }
      }),
      this.prisma.customerAdjustment.findMany({
        where: { companyId, customerId: { in: customerIds } },
        select: { customerId: true, direction: true, amount: true }
      })
    ]);

    const now = new Date();

    for (const invoice of invoices) {
      const entry = result.get(invoice.customerId);
      if (!entry) continue;
      const remaining = scaled(invoice.remainingAmount.toString());
      if (remaining <= 0n) continue;
      entry.balance += remaining;
      entry.unpaidCount += 1;
      if (invoice.dueDate && invoice.dueDate < now) entry.overdueAmount += remaining;
    }

    for (const adjustment of adjustments) {
      const entry = result.get(adjustment.customerId);
      if (!entry) continue;
      const amount = scaled(adjustment.amount.toString());
      entry.balance += adjustment.direction === "CUSTOMER_OWES_US" ? amount : -amount;
    }

    return result;
  }

  async list(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.CustomerManage);
    const q = paginationQuerySchema.parse(raw);
    const where: Prisma.CustomerWhereInput = {
      companyId: actor.companyId,
      active: q.status === "ARCHIVED" ? false : true,
      OR: q.search
        ? ["contactName", "companyName", "email", "phone"].map(field => ({
            [field]: { contains: q.search, mode: "insensitive" }
          }))
        : undefined
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: { addresses: true },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { updatedAt: q.sortDirection }
      }),
      this.prisma.customer.count({ where })
    ]);

    if (!actor.permissions.includes(Permissions.FinancialRead)) {
      return { items, total, page: q.page, pageSize: q.pageSize };
    }

    const summaries = await this.summaries(actor.companyId, items.map(item => item.id));
    return {
      items: items.map(item => {
        const value = summaries.get(item.id) ?? { balance: 0n, overdueAmount: 0n, unpaidCount: 0 };
        return {
          ...item,
          financial: {
            balance: formatScaled(value.balance),
            overdueAmount: formatScaled(value.overdueAmount),
            unpaidCount: value.unpaidCount,
            status: this.financialStatus(value.balance, value.overdueAmount)
          }
        };
      }),
      total,
      page: q.page,
      pageSize: q.pageSize
    };
  }

  async get(actor: AuthenticatedUser, id: string) {
    assertCan(actor, Permissions.CustomerManage);
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId: actor.companyId },
      include: { addresses: true }
    });
    if (!customer) throw new NotFoundException("Client introuvable.");
    return customer;
  }

  async save(actor: AuthenticatedUser, body: unknown, id?: string) {
    assertCan(actor, Permissions.CustomerManage);
    const input = customerSchema.parse(body);
    const { billingAddress, deliveryAddress, ...data } = input;

    return this.prisma.$transaction(async tx => {
      let before;
      if (id) {
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${id} AND "companyId"=${actor.companyId} FOR UPDATE`;
        before = await tx.customer.findFirst({ where: { id, companyId: actor.companyId } });
        if (!before) throw new NotFoundException("Client introuvable.");
        await tx.address.deleteMany({ where: { customerId: id, companyId: actor.companyId } });
      }

      const addresses = {
        create: [
          ...(billingAddress
            ? [{ companyId: actor.companyId, kind: "BILLING" as const, rawText: billingAddress }]
            : []),
          ...(deliveryAddress
            ? [{ companyId: actor.companyId, kind: "DELIVERY" as const, rawText: deliveryAddress }]
            : [])
        ]
      };

      const customer = id
        ? await tx.customer.update({
            where: { id },
            data: { ...data, addresses },
            include: { addresses: true }
          })
        : await tx.customer.create({
            data: { ...data, companyId: actor.companyId, addresses },
            include: { addresses: true }
          });

      await this.audit.record(
        {
          companyId: actor.companyId,
          actorId: actor.id,
          action: id ? "customer.updated" : "customer.created",
          entityType: "Customer",
          entityId: customer.id,
          before: before ? { name: before.companyName ?? before.contactName, active: before.active } : undefined,
          after: { name: customer.companyName ?? customer.contactName, active: customer.active }
        },
        tx
      );

      return customer;
    });
  }

  async archive(actor: AuthenticatedUser, id: string) {
    assertCan(actor, Permissions.CustomerManage);
    return this.prisma.$transaction(async tx => {
      const result = await tx.customer.updateMany({
        where: { id, companyId: actor.companyId },
        data: { active: false }
      });
      if (!result.count) throw new NotFoundException("Client introuvable.");
      await this.audit.record(
        {
          companyId: actor.companyId,
          actorId: actor.id,
          action: "customer.archived",
          entityType: "Customer",
          entityId: id
        },
        tx
      );
      return { ok: true };
    });
  }

  async financial(actor: AuthenticatedUser, customerId: string) {
    assertCan(actor, Permissions.FinancialRead);
    await this.get(actor, customerId);

    const [invoices, payments, adjustments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          companyId: actor.companyId,
          customerId,
          status: { notIn: ["DRAFT", "CANCELLED"] }
        },
        select: {
          id: true,
          number: true,
          internalRef: true,
          status: true,
          issueDate: true,
          dueDate: true,
          total: true,
          paidAmount: true,
          remainingAmount: true
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
      }),
      this.prisma.payment.findMany({
        where: { companyId: actor.companyId, customerId, cancelledAt: null },
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          paidAt: true,
          invoice: { select: { id: true, number: true, internalRef: true } }
        },
        orderBy: { paidAt: "desc" }
      }),
      this.prisma.customerAdjustment.findMany({
        where: { companyId: actor.companyId, customerId },
        select: {
          id: true,
          direction: true,
          amount: true,
          reason: true,
          effectiveAt: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } }
        },
        orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }]
      })
    ]);

    const totalInvoiced = invoices.reduce((sum, invoice) => sum + scaled(invoice.total.toString()), 0n);
    const totalPaid = payments.reduce((sum, payment) => sum + scaled(payment.amount.toString()), 0n);

    const now = new Date();
    let invoiceBalance = 0n;
    let overdueAmount = 0n;
    let unpaidCount = 0;

    const openInvoices = invoices.filter(invoice => {
      const remaining = scaled(invoice.remainingAmount.toString());
      if (remaining <= 0n) return false;
      invoiceBalance += remaining;
      unpaidCount += 1;
      if (invoice.dueDate && invoice.dueDate < now) overdueAmount += remaining;
      return true;
    });

    const adjustmentsNet = adjustments.reduce((sum, adjustment) => {
      const amount = scaled(adjustment.amount.toString());
      return sum + (adjustment.direction === "CUSTOMER_OWES_US" ? amount : -amount);
    }, 0n);

    const balance = invoiceBalance + adjustmentsNet;

    return {
      balance: formatScaled(balance),
      totalInvoiced: formatScaled(totalInvoiced),
      totalPaid: formatScaled(totalPaid),
      adjustmentsNet: formatScaled(adjustmentsNet),
      overdueAmount: formatScaled(overdueAmount),
      unpaidCount,
      status: this.financialStatus(balance, overdueAmount),
      lastPaymentAt: payments[0]?.paidAt ?? null,
      openInvoices,
      recentPayments: payments.slice(0, 20),
      adjustments
    };
  }

  async createAdjustment(actor: AuthenticatedUser, customerId: string, body: unknown) {
    assertCan(actor, Permissions.PaymentManage);
    const input = customerAdjustmentSchema.parse(body);
    await this.get(actor, customerId);

    const duplicate = await this.prisma.customerAdjustment.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: actor.companyId,
          idempotencyKey: input.idempotencyKey
        }
      }
    });

    if (duplicate) {
      if (duplicate.customerId !== customerId) {
        throw new ConflictException("Cle d'idempotence deja utilisee.");
      }
      return duplicate;
    }

    return this.prisma.$transaction(async tx => {
      const adjustment = await tx.customerAdjustment.create({
        data: {
          companyId: actor.companyId,
          customerId,
          createdById: actor.id,
          direction: input.direction,
          amount: input.amount,
          reason: input.reason,
          effectiveAt: input.effectiveAt,
          idempotencyKey: input.idempotencyKey
        },
        include: { createdBy: { select: { id: true, name: true } } }
      });

      await this.audit.record(
        {
          companyId: actor.companyId,
          actorId: actor.id,
          action: "customer.adjustment.created",
          entityType: "CustomerAdjustment",
          entityId: adjustment.id,
          after: {
            customerId,
            direction: adjustment.direction,
            amount: adjustment.amount.toString(),
            reason: adjustment.reason,
            effectiveAt: adjustment.effectiveAt.toISOString()
          }
        },
        tx
      );

      return adjustment;
    });
  }

  async timeline(actor: AuthenticatedUser, customerId: string, raw: unknown) {
    assertCan(actor, Permissions.FinancialRead);
    await this.get(actor, customerId);
    const q = paginationQuerySchema.parse(raw);

    const union = Prisma.sql`
      SELECT id, 'QUOTE' AS type, COALESCE(number,"internalRef") AS number, "createdAt" AS date, total::text AS amount, status::text AS status
        FROM "Quote" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}
      UNION ALL
      SELECT id, 'INVOICE', COALESCE(number,"internalRef"), "createdAt", total::text, status::text
        FROM "Invoice" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}
      UNION ALL
      SELECT id, 'DELIVERY_NOTE', COALESCE(number,"internalRef"), "createdAt", total::text, status::text
        FROM "DeliveryNote" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}
      UNION ALL
      SELECT id, 'PAYMENT', COALESCE(reference,id), "paidAt", amount::text,
        CASE WHEN "cancelledAt" IS NULL THEN 'REGISTERED' ELSE 'CANCELLED' END
        FROM "Payment" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}
      UNION ALL
      SELECT id, 'ADJUSTMENT',
        CASE WHEN direction='CUSTOMER_OWES_US' THEN 'Dette client' ELSE 'Crédit client' END,
        "effectiveAt",
        CASE WHEN direction='CUSTOMER_OWES_US' THEN amount::text ELSE '-' || amount::text END,
        direction::text
        FROM "CustomerAdjustment" WHERE "companyId"=${actor.companyId} AND "customerId"=${customerId}`;

    const [items, count] = await this.prisma.$transaction([
      this.prisma.$queryRaw(
        Prisma.sql`SELECT * FROM (${union}) timeline ORDER BY date DESC, id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`
      ),
      this.prisma.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS total FROM (${union}) timeline`
      )
    ]);

    return {
      items,
      total: Number(count[0]?.total ?? 0),
      page: q.page,
      pageSize: q.pageSize
    };
  }
}
