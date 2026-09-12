import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { Permissions, rateSchema, scaled } from "@as-tino/shared";
import { AuditService } from "../audit/audit.service.js";
import { assertCan } from "../common/access.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
const prefix = z.string().regex(/^[A-Z][A-Z0-9-]{0,11}$/);
const text = z.string().trim().max(250);
const schema = z.object({ companyName: z.string().trim().min(2).max(150).optional(), legalName: text.optional(), taxIdentificationNumber: text.optional(),
  email: z.string().email().max(254).optional(), phone: z.string().max(50).optional(), address: z.string().max(2000).optional(), logoAssetId: z.string().max(100).nullable().optional(),
  allowNegativeStock: z.boolean().optional(), quotePrefix: prefix.optional(), invoicePrefix: prefix.optional(), deliveryNotePrefix: prefix.optional(),
  defaultTaxRate: rateSchema.optional(), taxRates: z.array(rateSchema).min(1).max(20).optional(), documentDiscountEnabled: z.boolean().optional(),
  paymentTerms: z.string().max(8000).optional(), footerText: z.string().max(150).optional() }).strict();
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async publicInfo(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.DashboardRead);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: actor.companyId }, select: { name: true, currency: true, locale: true, timezone: true, logoAssetId: true } });
    return { ...company, logoUrl: company.logoAssetId ? `/api/v1/files/${company.logoAssetId}` : null };
  }
  async documentDefaults(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.DocumentManage); assertCan(actor, Permissions.FinancialRead);
    return this.prisma.businessSettings.findUniqueOrThrow({ where: { companyId: actor.companyId }, select: { defaultTaxRate: true, taxRates: true, documentDiscountEnabled: true, paymentTerms: true } });
  }
  async get(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.SettingsManage);
    return this.prisma.company.findUniqueOrThrow({ where: { id: actor.companyId }, include: { businessSettings: true, documentSequences: { orderBy: [{ year: "desc" }, { documentType: "asc" }], take: 30 } } });
  }
  async update(actor: AuthenticatedUser, body: unknown) {
    assertCan(actor, Permissions.SettingsManage); const input = schema.parse(body);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.companyId + ':commercial'},0))`;
      await tx.$queryRaw`SELECT id FROM "BusinessSettings" WHERE "companyId"=${actor.companyId} FOR UPDATE`;
      const before = await tx.company.findUniqueOrThrow({ where: { id: actor.companyId }, include: { businessSettings: true } });
      if (input.allowNegativeStock === false && await tx.stockBalance.count({ where: { companyId: actor.companyId, quantity: { lt: "0" } } })) throw new ConflictException("Corrigez les stocks negatifs avant de desactiver cette option.");
      if (input.logoAssetId && !await tx.fileAsset.findFirst({ where: { id: input.logoAssetId, companyId: actor.companyId, entityType: "IMAGE" } })) throw new BadRequestException("Logo invalide.");
      const rates = input.taxRates ?? before.businessSettings?.taxRates;
      const defaultRate = input.defaultTaxRate ?? before.businessSettings?.defaultTaxRate.toString() ?? "19";
      if (!Array.isArray(rates) || !rates.some(rate => scaled(String(rate), 2) === scaled(defaultRate, 2))) throw new BadRequestException("Le taux par defaut doit faire partie des taux autorises.");
      const { companyName, legalName, taxIdentificationNumber, email, phone, address, logoAssetId, ...settings } = input;
      const updated = await tx.company.update({ where: { id: actor.companyId }, data: { name: companyName, legalName, taxIdentificationNumber, email, phone, address, logoAssetId,
        businessSettings: { update: settings } }, include: { businessSettings: true } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "settings.updated", entityType: "BusinessSettings", entityId: updated.businessSettings?.id,
        before: { companyName: before.name, allowNegativeStock: before.businessSettings?.allowNegativeStock, taxRates: before.businessSettings?.taxRates }, after: input }, tx);
      return updated;
    });
  }
}
