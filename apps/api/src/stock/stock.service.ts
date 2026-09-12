import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type StockMovementType } from "@prisma/client";
import { z } from "zod";
import { assertStockAvailable, formatScaled, idempotencyKeySchema, paginationQuerySchema, Permissions, positiveQuantitySchema,
  reversalDelta, scaled, signedStockDelta, stockMovementSchema, StockMovementTypes } from "@as-tino/shared";
import { AuditService } from "../audit/audit.service.js";
import { assertCan } from "../common/access.js";
import { MutationService } from "../common/mutation.service.js";
import { canonical, digest } from "../common/json.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { productDto } from "../products/product-dto.js";
import { PrismaService } from "../prisma/prisma.service.js";
export type MovementInput = {
  productId: string; warehouseId: string; type: StockMovementType; quantity: string; direction?: "IN" | "OUT";
  customerId?: string; deliveryNoteId?: string; note?: string; idempotencyKey: string; reversedMovementId?: string; overrideDelta?: string;
};
const includes = { product: { include: { balances: true } }, warehouse: true, user: { select: { id: true, name: true } },
  customer: { select: { id: true, contactName: true, companyName: true } }, reversalMovement: { select: { id: true } } } as const;
const reverseSchema = z.object({ reason: z.string().trim().min(5).max(1000), idempotencyKey: idempotencyKeySchema }).strict();
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mutations: MutationService) {}
  async overview(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.StockRead);
    const all = actor.permissions.includes(Permissions.StockReadAll);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [products, movements, openIncidents, warehouses] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { companyId: actor.companyId, status: "ACTIVE" },
        select: { minimumStock: true, balances: { where: { warehouse: { active: true } }, select: { quantity: true, warehouseId: true } } }
      }),
      this.prisma.stockMovement.findMany({
        where: { companyId: actor.companyId, userId: all ? undefined : actor.id, createdAt: { gte: since } },
        select: { quantityBefore: true, quantityAfter: true }
      }),
      this.prisma.stockIncident.count({
        where: { companyId: actor.companyId, status: "OPEN", reportedById: all ? undefined : actor.id }
      }),
      this.prisma.warehouse.findMany({
        where: { companyId: actor.companyId, active: true },
        select: { id: true, code: true, name: true, stockBalances: { where: { product: { status: "ACTIVE" } }, select: { quantity: true } } },
        orderBy: { name: "asc" }
      })
    ]);
    let total = 0n;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    for (const product of products) {
      const quantity = product.balances.reduce((sum, balance) => sum + scaled(balance.quantity.toString()), 0n);
      total += quantity;
      if (quantity <= 0n) outOfStockCount++;
      if (quantity <= scaled(product.minimumStock.toString())) lowStockCount++;
    }
    let entries24h = 0n;
    let withdrawals24h = 0n;
    for (const movement of movements) {
      const delta = scaled(movement.quantityAfter.toString()) - scaled(movement.quantityBefore.toString());
      if (delta > 0n) entries24h += delta;
      if (delta < 0n) withdrawals24h += -delta;
    }
    return {
      productCount: products.length,
      totalStockQuantity: formatScaled(total),
      lowStockCount,
      outOfStockCount,
      movementCount24h: movements.length,
      entries24h: formatScaled(entries24h),
      withdrawals24h: formatScaled(withdrawals24h),
      openIncidentCount: openIncidents,
      warehouseCount: warehouses.length,
      warehouseBreakdown: warehouses.map(warehouse => ({
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        quantity: formatScaled(warehouse.stockBalances.reduce((sum, balance) => sum + scaled(balance.quantity.toString()), 0n))
      }))
    };
  }
  async list(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.StockRead); const q = paginationQuerySchema.parse(raw);
    const all = actor.permissions.includes(Permissions.StockReadAll);
    const where: Prisma.StockMovementWhereInput = { companyId: actor.companyId, userId: all ? q.userId : actor.id,
      productId: q.productId, warehouseId: q.warehouseId, customerId: q.customerId, product: q.categoryId ? { categoryId: q.categoryId } : undefined,
      type: q.type ? z.enum(StockMovementTypes).parse(q.type) : undefined, createdAt: { gte: q.dateFrom, lte: q.dateTo } };
    const [items, total] = await this.prisma.$transaction([this.prisma.stockMovement.findMany({ where, include: includes,
      orderBy: { createdAt: q.sortDirection }, skip: (q.page-1)*q.pageSize, take: q.pageSize }), this.prisma.stockMovement.count({ where })]);
    return { items: items.map(m => ({ ...m, product: productDto(actor, m.product) })), total, page: q.page, pageSize: q.pageSize };
  }
  async createMovement(actor: AuthenticatedUser, body: unknown) {
    const input = stockMovementSchema.parse(body);
    assertCan(actor, input.type === "WITHDRAWAL" ? Permissions.StockWithdraw : Permissions.StockAdjust);
    if (["CUSTOMER_DELIVERY", "CANCELLATION_REVERSAL"].includes(input.type)) throw new BadRequestException("Utilisez le workflow de livraison ou d'inversion.");
    if (["ADJUSTMENT", "DAMAGED"].includes(input.type) && (!input.note || input.note.length < 5)) throw new BadRequestException("Un motif detaille est requis.");
    const result = await this.mutations.run(actor, input.idempotencyKey, "stock.create", input, tx => this.createMovementInTransaction(tx, actor, input));
    // Re-serialize durable cached results against CURRENT permissions after a role change.
    return { ...result, product: productDto(actor, result.product) };
  }
  async reverse(actor: AuthenticatedUser, id: string, body: unknown) {
    assertCan(actor, Permissions.StockAdjust); const input = reverseSchema.parse(body);
    return this.mutations.run(actor, input.idempotencyKey, "stock.reverse", { id, ...input }, async tx => {
      const original = await this.originalForReversal(tx, actor, id);
      if (original.deliveryNoteId) throw new ConflictException("Annulez le bon de livraison pour inverser ses mouvements ensemble.");
      return this.reverseInTransaction(tx, actor, id, input.idempotencyKey, input.reason);
    });
  }
  private async originalForReversal(tx: Prisma.TransactionClient, actor: AuthenticatedUser, id: string) {
    await tx.$queryRaw`SELECT id FROM "StockMovement" WHERE id=${id} AND "companyId"=${actor.companyId} FOR UPDATE`;
    const original = await tx.stockMovement.findFirst({ where: { id, companyId: actor.companyId }, include: { reversalMovement: true } });
    if (!original) throw new NotFoundException("Mouvement introuvable.");
    if (original.type === "CANCELLATION_REVERSAL" || original.reversalMovement) throw new ConflictException("Ce mouvement est une inversion ou a deja ete inverse.");
    return original;
  }
  async reverseInTransaction(tx: Prisma.TransactionClient, actor: AuthenticatedUser, id: string, key: string, reason: string) {
    const original = await this.originalForReversal(tx, actor, id);
    assertCan(actor, original.deliveryNoteId ? Permissions.DocumentManage : Permissions.StockAdjust);
    const delta = reversalDelta(original.quantityBefore.toString(), original.quantityAfter.toString());
    return this.createMovementInTransaction(tx, actor, { productId: original.productId, warehouseId: original.warehouseId,
      type: "CANCELLATION_REVERSAL", quantity: original.quantity.toString(), customerId: original.customerId ?? undefined,
      deliveryNoteId: original.deliveryNoteId ?? undefined, reversedMovementId: original.id, overrideDelta: delta, note: reason, idempotencyKey: key });
  }
  async createMovementInTransaction(tx: Prisma.TransactionClient, actor: AuthenticatedUser, input: MovementInput) {
    assertCan(actor, input.deliveryNoteId ? Permissions.DocumentManage : input.type === "WITHDRAWAL" ? Permissions.StockWithdraw : Permissions.StockAdjust);
    positiveQuantitySchema.parse(input.quantity); idempotencyKeySchema.parse(input.idempotencyKey);
    const hash = digest(canonical(input));
    // All internal callers use durable idempotency or a locked delivery-note row.
    const existing = await tx.stockMovement.findUnique({ where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } }, include: includes });
    if (existing) {
      if (existing.userId !== actor.id || existing.requestHash !== hash) throw new ConflictException("Cle de mouvement deja utilisee.");
      return { ...existing, product: productDto(actor, existing.product) };
    }
    await tx.$queryRaw`SELECT id FROM "BusinessSettings" WHERE "companyId"=${actor.companyId} FOR SHARE`;
    const settings = await tx.businessSettings.findUniqueOrThrow({ where: { companyId: actor.companyId } });
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${input.productId} AND "companyId"=${actor.companyId} FOR SHARE`;
    const product = await tx.product.findFirst({ where: { id: input.productId, companyId: actor.companyId,
      status: input.reversedMovementId ? undefined : "ACTIVE" } });
    if (!product) throw new NotFoundException("Produit actif introuvable.");
    await tx.$queryRaw`SELECT id FROM "Warehouse" WHERE id=${input.warehouseId} AND "companyId"=${actor.companyId} FOR SHARE`;
    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: actor.companyId,
      active: input.reversedMovementId ? undefined : true } });
    if (!warehouse) throw new NotFoundException("Depot introuvable.");
    if (input.customerId && !await tx.customer.findFirst({ where: { id: input.customerId, companyId: actor.companyId } })) throw new BadRequestException("Client invalide.");
    if (input.deliveryNoteId && !await tx.deliveryNote.findFirst({ where: { id: input.deliveryNoteId, companyId: actor.companyId } })) throw new BadRequestException("Bon de livraison invalide.");
    await tx.stockBalance.upsert({ where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } }, update: {},
      create: { companyId: actor.companyId, productId: input.productId, warehouseId: input.warehouseId, quantity: "0" } });
    await tx.$queryRaw`SELECT id FROM "StockBalance" WHERE "productId"=${input.productId} AND "warehouseId"=${input.warehouseId} FOR UPDATE`;
    const balance = await tx.stockBalance.findUniqueOrThrow({ where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } } });
    if (input.type === "INITIAL_STOCK" && await tx.stockMovement.findFirst({ where: { companyId: actor.companyId, productId: input.productId, warehouseId: input.warehouseId } })) throw new ConflictException("Le stock initial existe deja. Enregistrez une entree ou un ajustement.");
    const delta = input.overrideDelta ?? signedStockDelta(input.type, input.quantity, input.direction);
    if ((input.type === "CANCELLATION_REVERSAL") !== Boolean(input.reversedMovementId && input.overrideDelta)) throw new BadRequestException("Relation d'inversion invalide.");
    try { assertStockAvailable(balance.quantity.toString(), delta, settings.allowNegativeStock); }
    catch { throw new ConflictException("Stock insuffisant ou quantite hors limite. Actualisez les disponibilites."); }
    const before = balance.quantity.toFixed(3); const after = formatScaled(scaled(before) + scaled(delta));
    await tx.stockBalance.update({ where: { id: balance.id }, data: { quantity: after } });
    const movement = await tx.stockMovement.create({ data: { companyId: actor.companyId, productId: input.productId, warehouseId: input.warehouseId,
      userId: actor.id, customerId: input.customerId, deliveryNoteId: input.deliveryNoteId, reversedMovementId: input.reversedMovementId, type: input.type,
      quantity: input.quantity, quantityBefore: before, quantityAfter: after, note: input.note, idempotencyKey: input.idempotencyKey, requestHash: hash }, include: includes });
    await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: input.reversedMovementId ? "stock.reversed" : "stock.created", entityType: "StockMovement", entityId: movement.id,
      after: { productId: input.productId, type: input.type, quantity: input.quantity, quantityBefore: before, quantityAfter: after, reversedMovementId: input.reversedMovementId }, reason: input.note }, tx);
    return { ...movement, product: productDto(actor, movement.product) };
  }
  async reportMistake(actor: AuthenticatedUser, movementId: string, body: unknown) {
    assertCan(actor, Permissions.StockReportMistake);
    const input = z.object({ description: z.string().trim().min(5).max(1000), idempotencyKey: idempotencyKeySchema }).strict().parse(body);
    return this.mutations.run(actor, input.idempotencyKey, "stock.incident", { movementId, ...input }, async tx => {
      const movement = await tx.stockMovement.findFirst({ where: { id: movementId, companyId: actor.companyId, userId: actor.permissions.includes(Permissions.StockReadAll) ? undefined : actor.id } });
      if (!movement) throw new NotFoundException("Mouvement introuvable.");
      const incident = await tx.stockIncident.create({ data: { ...input, companyId: actor.companyId, movementId, reportedById: actor.id } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "stock.mistake.reported", entityType: "StockIncident", entityId: incident.id, after: { movementId, description: input.description } }, tx);
      return incident;
    });
  }
  async incidents(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.StockRead); const q = paginationQuerySchema.parse(raw);
    const where: Prisma.StockIncidentWhereInput = { companyId: actor.companyId, reportedById: actor.permissions.includes(Permissions.StockReadAll) ? undefined : actor.id,
      status: q.status ? z.enum(["OPEN", "RESOLVED"]).parse(q.status) : undefined };
    const [items, total] = await this.prisma.$transaction([this.prisma.stockIncident.findMany({ where, skip: (q.page-1)*q.pageSize, take: q.pageSize,
      include: { movement: { select: { id: true, quantity: true, product: { select: { name: true, sku: true } } } }, reportedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }), this.prisma.stockIncident.count({ where })]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async resolveIncident(actor: AuthenticatedUser, id: string, body: unknown) {
    assertCan(actor, Permissions.StockAdjust); const input = z.object({ resolution: z.string().min(5).max(1000) }).strict().parse(body);
    return this.prisma.$transaction(async tx => {
      const changed = await tx.stockIncident.updateMany({ where: { id, companyId: actor.companyId, status: "OPEN" }, data: { ...input, status: "RESOLVED", resolvedById: actor.id, resolvedAt: new Date() } });
      if (!changed.count) throw new ConflictException("Signalement introuvable ou deja traite.");
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "stock.mistake.resolved", entityType: "StockIncident", entityId: id, reason: input.resolution }, tx);
      return { ok: true };
    });
  }
}
