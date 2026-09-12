import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { csvRow, effectiveInvoiceStatus, paginationQuerySchema, Permissions, StockMovementTypes, type ListQuery } from "@as-tino/shared";
import { assertCan } from "../common/access.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { productDto } from "../products/product-dto.js";
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  private range(q: ListQuery) {
    const to = q.dateTo ?? new Date(); const from = q.dateFrom ?? new Date(to.getTime()-30*86400_000);
    if (to.getTime()-from.getTime() > 366*86400_000) throw new BadRequestException("Limitez la periode a 366 jours par rapport.");
    return { from, to };
  }
  async worker(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.DashboardRead); assertCan(actor, Permissions.StockRead);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: actor.companyId } });
    const [recent, count] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({ where: { companyId: actor.companyId, userId: actor.id }, orderBy: { createdAt: "desc" }, take: 10,
        include: { product: { include: { balances: true } }, warehouse: { select: { name: true } } } }),
      this.prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "StockMovement" WHERE "companyId"=${actor.companyId} AND "userId"=${actor.id} AND ("createdAt" AT TIME ZONE ${company.timezone})::date=(now() AT TIME ZONE ${company.timezone})::date`]);
    return { todayOperations: count[0]?.count ?? 0, recentMovements: recent.map(m => ({ ...m, product: productDto(actor, m.product) })) };
  }
  async dashboard(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.ReportRead); assertCan(actor, Permissions.FinancialRead); const q = paginationQuerySchema.parse(raw); const { from, to } = this.range(q);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: actor.companyId } });
    const productFilter = Prisma.sql`p."companyId"=${actor.companyId} AND p.status='ACTIVE' ${q.categoryId ? Prisma.sql`AND p."categoryId"=${q.categoryId}` : Prisma.empty} ${q.productId ? Prisma.sql`AND p.id=${q.productId}` : Prisma.empty}`;
    const stockCte = Prisma.sql`WITH stock AS (SELECT p.id,p.sku,p.name,p.unit,p."minimumStock",p."purchasePrice",COALESCE(sum(b.quantity),0) AS quantity FROM "Product" p LEFT JOIN "StockBalance" b ON b."productId"=p.id ${q.warehouseId ? Prisma.sql`AND b."warehouseId"=${q.warehouseId}` : Prisma.empty} WHERE ${productFilter} GROUP BY p.id)`;
    const movementWhere: Prisma.StockMovementWhereInput = { companyId: actor.companyId, productId: q.productId, warehouseId: q.warehouseId, userId: q.userId, customerId: q.customerId,
      product: q.categoryId ? { categoryId: q.categoryId } : undefined, createdAt: { gte: from, lte: to }, type: q.type ? z.enum(StockMovementTypes).parse(q.type) : undefined };
    const movementFilter = Prisma.sql`m."companyId"=${actor.companyId} AND m."createdAt">=${from} AND m."createdAt"<=${to}
      ${q.productId ? Prisma.sql`AND m."productId"=${q.productId}` : Prisma.empty} ${q.warehouseId ? Prisma.sql`AND m."warehouseId"=${q.warehouseId}` : Prisma.empty}
      ${q.userId ? Prisma.sql`AND m."userId"=${q.userId}` : Prisma.empty} ${q.customerId ? Prisma.sql`AND m."customerId"=${q.customerId}` : Prisma.empty}
      ${q.type ? Prisma.sql`AND m.type=${q.type}::"StockMovementType"` : Prisma.empty} ${q.categoryId ? Prisma.sql`AND p."categoryId"=${q.categoryId}` : Prisma.empty}`;
    const invoiceWhere: Prisma.InvoiceWhereInput = { companyId: actor.companyId, customerId: q.customerId, status: { notIn: ["DRAFT","CANCELLED"] }, issueDate: { gte: from, lte: to } };
    const outstandingWhere: Prisma.InvoiceWhereInput = { companyId: actor.companyId, customerId: q.customerId, status: { notIn: ["DRAFT","CANCELLED"] }, remainingAmount: { gt: "0" } };
    const [inventory, alerts, recentMovements, trend, mostWithdrawn, workerActivity, latestQuotes, invoiced, payments, unpaidInvoices, unpaidCount, overdueCount] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ productCount: number; totalStockQuantity: string; inventoryValue: string; lowStockCount: number; outOfStockCount: number }[]>(Prisma.sql`${stockCte} SELECT count(*)::int AS "productCount",COALESCE(sum(quantity),0)::text AS "totalStockQuantity",round(COALESCE(sum(quantity*"purchasePrice"),0),3)::text AS "inventoryValue",count(*) FILTER(WHERE quantity>0 AND quantity<="minimumStock")::int AS "lowStockCount",count(*) FILTER(WHERE quantity<=0)::int AS "outOfStockCount" FROM stock`),
      this.prisma.$queryRaw(Prisma.sql`${stockCte} SELECT id,sku,name,unit,quantity::text,"minimumStock"::text FROM stock WHERE quantity<="minimumStock" ORDER BY stock.quantity,sku LIMIT 12`),
      this.prisma.stockMovement.findMany({ where: movementWhere, take: 10, orderBy: { createdAt: "desc" }, include: { product: { select: { id: true, name: true, sku: true, unit: true } }, user: { select: { id: true, name: true } } } }),
      this.prisma.$queryRaw(Prisma.sql`WITH days AS (SELECT generate_series((${from}::timestamptz AT TIME ZONE ${company.timezone})::date,(${to}::timestamptz AT TIME ZONE ${company.timezone})::date,'1 day')::date AS day), activity AS (SELECT (m."createdAt" AT TIME ZONE ${company.timezone})::date AS day,sum(greatest(m."quantityAfter"-m."quantityBefore",0)) AS entries,sum(greatest(m."quantityBefore"-m."quantityAfter",0)) AS withdrawals FROM "StockMovement" m JOIN "Product" p ON p.id=m."productId" WHERE ${movementFilter} GROUP BY 1) SELECT to_char(d.day,'YYYY-MM-DD') AS date,COALESCE(a.entries,0)::text AS entries,COALESCE(a.withdrawals,0)::text AS withdrawals FROM days d LEFT JOIN activity a ON a.day=d.day ORDER BY d.day`),
      this.prisma.$queryRaw(Prisma.sql`SELECT p.id,p.name,p.sku,count(*)::int AS operations,sum(m.quantity)::text AS quantity FROM "StockMovement" m JOIN "Product" p ON p.id=m."productId" WHERE ${movementFilter} AND m.type IN ('WITHDRAWAL','CUSTOMER_DELIVERY') AND NOT EXISTS(SELECT 1 FROM "StockMovement" r WHERE r."reversedMovementId"=m.id) GROUP BY p.id ORDER BY operations DESC,sum(m.quantity) DESC LIMIT 8`),
      this.prisma.$queryRaw(Prisma.sql`SELECT u.id,u.name,count(*)::int AS operations,sum(greatest(m."quantityBefore"-m."quantityAfter",0))::text AS withdrawn FROM "StockMovement" m JOIN "User" u ON u.id=m."userId" JOIN "Product" p ON p.id=m."productId" WHERE ${movementFilter} GROUP BY u.id ORDER BY operations DESC LIMIT 15`),
      this.prisma.quote.findMany({ where: { companyId: actor.companyId, customerId: q.customerId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: 6, include: { customer: { select: { contactName: true, companyName: true } } } }),
      this.prisma.invoice.aggregate({ where: invoiceWhere, _sum: { total: true }, _count: true }),
      this.prisma.payment.aggregate({ where: { companyId: actor.companyId, customerId: q.customerId, cancelledAt: null, paidAt: { gte: from, lte: to } }, _sum: { amount: true }, _count: true }),
      this.prisma.invoice.findMany({ where: outstandingWhere, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 10, include: { customer: { select: { contactName: true, companyName: true } } } }),
      this.prisma.invoice.aggregate({ where: outstandingWhere, _count: true, _sum: { remainingAmount: true } }),
      this.prisma.invoice.count({ where: { ...outstandingWhere, dueDate: { lt: new Date() } } })
    ]);
    return { period: { from, to }, ...inventory[0], stockAlerts: alerts, recentMovements, trend, mostWithdrawnProducts: mostWithdrawn, workerActivity, latestQuotes,
      invoicedTotal: invoiced._sum.total?.toFixed(3) ?? "0.000", invoiceCount: invoiced._count, revenueTotal: payments._sum.amount?.toFixed(3) ?? "0.000", paymentCount: payments._count,
      unpaidInvoices, unpaidCount: unpaidCount._count, outstandingTotal: unpaidCount._sum.remainingAmount?.toFixed(3) ?? "0.000", overdueCount };
  }
  async *csv(actor: AuthenticatedUser, report: string, raw: unknown): AsyncGenerator<string> {
    assertCan(actor, Permissions.ReportRead); assertCan(actor, Permissions.FinancialRead);
    const kind = z.enum(["stock","movements","invoices","payments"]).parse(report); const q = paginationQuerySchema.parse(raw);
    const { from, to } = this.range(q); yield "\uFEFF";
    const headers = { stock: ["SKU","Code","Produit","Categorie","Depot","Quantite","Unite","Stock minimum"], movements: ["Date","SKU","Produit","Depot","Utilisateur","Type","Quantite","Avant","Apres","Motif"],
      invoices: ["Numero","Client","Date emission","Echeance","Statut","HT","TVA","TTC","Paye","Solde"], payments: ["Date","Facture","Client","Montant","Methode","Reference","Annule le"] };
    yield csvRow(headers[kind]);
    let cursor: string | undefined;
    while (true) {
      const page = { take: 500, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
      let rows: { id: string; cells: unknown[] }[];
      if (kind === "stock") {
        const items = await this.prisma.stockBalance.findMany({ ...page, where: { companyId: actor.companyId, warehouseId: q.warehouseId, productId: q.productId, product: { categoryId: q.categoryId, status: "ACTIVE" } }, include: { product: { include: { category: true } }, warehouse: true } });
        rows = items.map(item => ({ id: item.id, cells: [item.product.sku,item.product.barcode,item.product.name,item.product.category?.name,item.warehouse.name,item.quantity.toFixed(3),item.product.unit,item.product.minimumStock.toFixed(3)] }));
      } else if (kind === "movements") {
        const items = await this.prisma.stockMovement.findMany({ ...page, where: { companyId: actor.companyId, productId: q.productId, userId: q.userId, customerId: q.customerId, warehouseId: q.warehouseId,
          product: { categoryId: q.categoryId }, type: q.type ? z.enum(StockMovementTypes).parse(q.type) : undefined, createdAt: { gte: from, lte: to } }, include: { product: true, warehouse: true, user: { select: { name: true } } } });
        rows = items.map(item => ({ id: item.id, cells: [item.createdAt.toISOString(),item.product.sku,item.product.name,item.warehouse.name,item.user.name,item.type,item.quantity.toFixed(3),item.quantityBefore.toFixed(3),item.quantityAfter.toFixed(3),item.note] }));
      } else if (kind === "invoices") {
        const status = q.status ? z.enum(["DRAFT","ISSUED","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED"]).parse(q.status) : undefined;
        const now = new Date();
        const statusWhere: Prisma.InvoiceWhereInput = status === "OVERDUE"
          ? { status: { in: ["ISSUED","PARTIALLY_PAID","OVERDUE"] }, remainingAmount: { gt: "0" }, dueDate: { lt: now } }
          : status === "ISSUED" || status === "PARTIALLY_PAID"
            ? { status, OR: [{ dueDate: null }, { dueDate: { gte: now } }] } : { status };
        const items = await this.prisma.invoice.findMany({ ...page, where: { companyId: actor.companyId, customerId: q.customerId, createdAt: { gte: from, lte: to }, ...statusWhere }, include: { customer: true } });
        rows = items.map(item => ({ id: item.id, cells: [item.number ?? item.internalRef,item.customer.companyName ?? item.customer.contactName,item.issueDate?.toISOString(),item.dueDate?.toISOString(),effectiveInvoiceStatus(item.status,item.remainingAmount.toString(),item.dueDate),item.subtotal.toFixed(3),item.taxAmount.toFixed(3),item.total.toFixed(3),item.paidAmount.toFixed(3),item.remainingAmount.toFixed(3)] }));
      } else {
        const items = await this.prisma.payment.findMany({ ...page, where: { companyId: actor.companyId, customerId: q.customerId, paidAt: { gte: from, lte: to } }, include: { invoice: { select: { number: true } }, customer: true } });
        rows = items.map(item => ({ id: item.id, cells: [item.paidAt.toISOString(),item.invoice.number,item.customer.companyName ?? item.customer.contactName,item.amount.toFixed(3),item.method,item.reference,item.cancelledAt?.toISOString()] }));
      }
      for (const row of rows) yield csvRow(row.cells);
      if (rows.length < 500) break;
      cursor = rows[rows.length-1]!.id;
    }
  }
}
