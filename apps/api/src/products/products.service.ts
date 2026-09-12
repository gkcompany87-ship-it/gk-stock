import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { createProductSchema, paginationQuerySchema, Permissions, scaled } from "@as-tino/shared";
import { z } from "zod";
import { AuditService } from "../audit/audit.service.js";
import { assertCan } from "../common/access.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { productDto } from "./product-dto.js";
const include = { category: true, balances: { include: { warehouse: true } } } as const;
const categorySchema = z.object({ name: z.string().trim().min(2).max(120) }).strict();
const warehouseSchema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().regex(/^[A-Z0-9_-]{2,30}$/), location: z.string().trim().max(250).optional() }).strict();
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async list(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.ProductRead); const q = paginationQuerySchema.parse(raw);
    const where: Prisma.ProductWhereInput = { companyId: actor.companyId, categoryId: q.categoryId,
      status: actor.permissions.includes(Permissions.ProductWrite) ? (q.status ? z.enum(["ACTIVE", "ARCHIVED"]).parse(q.status) : undefined) : "ACTIVE",
      OR: q.search ? [{ name: { contains: q.search, mode: "insensitive" } }, { sku: { contains: q.search, mode: "insensitive" } }, { barcode: { contains: q.search, mode: "insensitive" } }] : undefined };
    const sort = q.sortBy && ["name", "sku", "createdAt", "updatedAt"].includes(q.sortBy) ? q.sortBy : "updatedAt";
    const [items, total] = await this.prisma.$transaction([this.prisma.product.findMany({ where, include, orderBy: { [sort]: q.sortDirection }, skip: (q.page-1)*q.pageSize, take: q.pageSize }), this.prisma.product.count({ where })]);
    return { items: items.map(p => productDto(actor, p)), total, page: q.page, pageSize: q.pageSize };
  }
  async get(actor: AuthenticatedUser, id: string) {
    assertCan(actor, Permissions.ProductRead);
    const product = await this.prisma.product.findFirst({ where: { id, companyId: actor.companyId,
      status: actor.permissions.includes(Permissions.ProductWrite) ? undefined : "ACTIVE" }, include });
    if (!product) throw new NotFoundException("Produit introuvable.");
    return productDto(actor, product);
  }
  async findByCode(actor: AuthenticatedUser, raw: string) {
    assertCan(actor, Permissions.ProductRead); const code = z.string().trim().min(1).max(150).parse(raw);
    const products = await this.prisma.product.findMany({ where: { companyId: actor.companyId, status: "ACTIVE", OR: [{ sku: code }, { barcode: code }] }, include, take: 2 });
    if (!products[0]) throw new NotFoundException("Aucun produit actif ne correspond a ce code.");
    if (products.length > 1) throw new ConflictException("Code ambigu. Contactez un administrateur.");
    return productDto(actor, products[0]);
  }
  private async references(tx: Prisma.TransactionClient, actor: AuthenticatedUser, input: { categoryId?: string; imageAssetId?: string; taxRate?: string }) {
    if (input.categoryId && !await tx.productCategory.findFirst({ where: { id: input.categoryId, companyId: actor.companyId, active: true } })) throw new BadRequestException("Categorie invalide.");
    if (input.imageAssetId && !await tx.fileAsset.findFirst({ where: { id: input.imageAssetId, companyId: actor.companyId, mimeType: { in: ["image/png", "image/jpeg", "image/webp"] } } })) throw new BadRequestException("Image invalide.");
    if (input.taxRate) {
      const settings = await tx.businessSettings.findUnique({ where: { companyId: actor.companyId } });
      const rates = settings?.taxRates;
      if (Array.isArray(rates) && !rates.some(rate => scaled(String(rate), 2) === scaled(input.taxRate!, 2))) throw new BadRequestException("Taux de TVA non configure.");
    }
  }
  private async codes(tx: Prisma.TransactionClient, actor: AuthenticatedUser, sku: string, barcode?: string | null, exceptId?: string) {
    const codes = [sku, ...(barcode ? [barcode] : [])];
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.companyId + ':catalog'},0))`;
    if (await tx.product.findFirst({ where: { companyId: actor.companyId, id: exceptId ? { not: exceptId } : undefined, OR: [{ sku: { in: codes } }, { barcode: { in: codes } }] } }))
      throw new ConflictException("Ce SKU ou code est deja utilise par un produit.");
  }
  async create(actor: AuthenticatedUser, body: unknown) {
    assertCan(actor, Permissions.ProductWrite); const input = createProductSchema.parse(body);
    return this.prisma.$transaction(async tx => {
      await this.references(tx, actor, input); await this.codes(tx, actor, input.sku, input.barcode);
      const warehouse = await tx.warehouse.upsert({ where: { companyId_code: { companyId: actor.companyId, code: "MAIN" } }, update: {}, create: { companyId: actor.companyId, code: "MAIN", name: "Depot principal" } });
      const product = await tx.product.create({ data: { ...input, companyId: actor.companyId, balances: { create: { companyId: actor.companyId, warehouseId: warehouse.id, quantity: "0" } } }, include });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "product.created", entityType: "Product", entityId: product.id, after: input }, tx);
      return productDto(actor, product);
    });
  }
  async update(actor: AuthenticatedUser, id: string, body: unknown) {
    assertCan(actor, Permissions.ProductWrite); const parsed = createProductSchema.partial().parse(body);
    // Zod defaults on optional properties must not silently replace unspecified PATCH fields.
    const input = Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.hasOwn(body as object, key))) as typeof parsed;
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.companyId + ':catalog'},0))`;
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} AND "companyId"=${actor.companyId} FOR UPDATE`;
      const before = await tx.product.findFirst({ where: { id, companyId: actor.companyId } });
      if (!before) throw new NotFoundException("Produit introuvable.");
      await this.references(tx, actor, input); await this.codes(tx, actor, input.sku ?? before.sku, input.barcode ?? before.barcode, id);
      const updated = await tx.product.update({ where: { id }, data: input, include });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "product.updated", entityType: "Product", entityId: id,
        before: { sku: before.sku, name: before.name, sellingPrice: before.sellingPrice.toString(), purchasePrice: before.purchasePrice.toString() }, after: input }, tx);
      return productDto(actor, updated);
    });
  }
  async archive(actor: AuthenticatedUser, id: string) {
    assertCan(actor, Permissions.ProductWrite);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} AND "companyId"=${actor.companyId} FOR UPDATE`;
      const product = await tx.product.findFirst({ where: { id, companyId: actor.companyId } });
      if (!product) throw new NotFoundException("Produit introuvable.");
      const updated = await tx.product.update({ where: { id }, data: { status: "ARCHIVED" }, include });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "product.archived", entityType: "Product", entityId: id, before: { status: product.status }, after: { status: "ARCHIVED" } }, tx);
      return productDto(actor, updated);
    });
  }
  async categories(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.ProductRead);
    return this.prisma.productCategory.findMany({ where: { companyId: actor.companyId, active: true }, orderBy: { name: "asc" } });
  }
  async createCategory(actor: AuthenticatedUser, body: unknown) {
    assertCan(actor, Permissions.ProductWrite); const input = categorySchema.parse(body);
    return this.prisma.$transaction(async tx => {
      const category = await tx.productCategory.upsert({ where: { companyId_name: { companyId: actor.companyId, name: input.name } }, update: { active: true }, create: { ...input, companyId: actor.companyId } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "category.upserted", entityType: "ProductCategory", entityId: category.id, after: input }, tx);
      return category;
    });
  }
  async warehouses(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.StockRead);
    return this.prisma.warehouse.findMany({ where: { companyId: actor.companyId, active: true }, orderBy: { code: "asc" } });
  }
  async createWarehouse(actor: AuthenticatedUser, body: unknown) {
    assertCan(actor, Permissions.StockAdjust); const input = warehouseSchema.parse(body);
    return this.prisma.$transaction(async tx => {
      const warehouse = await tx.warehouse.upsert({ where: { companyId_code: { companyId: actor.companyId, code: input.code } }, update: input, create: { ...input, companyId: actor.companyId } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "warehouse.upserted", entityType: "Warehouse", entityId: warehouse.id, after: input }, tx);
      return warehouse;
    });
  }
}
