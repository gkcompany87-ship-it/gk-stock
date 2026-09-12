import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type DocumentType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { calculateDocument, calculatePayment, canTransitionDeliveryNote, canTransitionInvoice, canTransitionQuote,
  documentSchema, effectiveInvoiceStatus, effectiveQuoteStatus, formatScaled, paginationQuerySchema, paymentSchema, Permissions, reasonSchema, scaled } from "@as-tino/shared";
import { AuditService } from "../audit/audit.service.js";
import { assertCan } from "../common/access.js";
import { canonical, digest, json } from "../common/json.js";
import { MutationService } from "../common/mutation.service.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StockService } from "../stock/stock.service.js";
import { NumberingService } from "./numbering.service.js";
import { documentInclude, type CommercialDocument, type DocumentSnapshot } from "./document-types.js";
const tableNames = { QUOTE: Prisma.raw('"Quote"'), INVOICE: Prisma.raw('"Invoice"'), DELIVERY_NOTE: Prisma.raw('"DeliveryNote"') };
type ParsedDocument = z.infer<typeof documentSchema>;
@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly stock: StockService,
    private readonly mutations: MutationService, private readonly numbering: NumberingService) {}
  private authorize(actor: AuthenticatedUser) { assertCan(actor, Permissions.DocumentManage); assertCan(actor, Permissions.FinancialRead); }
  private async serial(tx: Prisma.TransactionClient, companyId: string) {
    // A small-business modular monolith deliberately serializes commercial lifecycle changes per company.
    // Stock withdrawals and independent invoice payments remain independently row-locked.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId + ':commercial'},0))`;
  }
  async load(tx: Prisma.TransactionClient, type: DocumentType, companyId: string, id: string, lock = false): Promise<CommercialDocument> {
    if (lock) await tx.$queryRaw(Prisma.sql`SELECT id FROM ${tableNames[type]} WHERE id=${id} AND "companyId"=${companyId} FOR UPDATE`);
    const where = { id, companyId };
    const result = type === "QUOTE" ? await tx.quote.findFirst({ where, include: documentInclude }) : type === "INVOICE" ?
      await tx.invoice.findFirst({ where, include: documentInclude }) : await tx.deliveryNote.findFirst({ where, include: documentInclude });
    if (!result) throw new NotFoundException("Document introuvable.");
    return result;
  }
  private output(type: DocumentType, doc: CommercialDocument) {
    const status = type === "INVOICE" && "remainingAmount" in doc ? effectiveInvoiceStatus(doc.status as Parameters<typeof effectiveInvoiceStatus>[0], doc.remainingAmount.toString(), doc.dueDate) :
      type === "QUOTE" && "expiryDate" in doc ? effectiveQuoteStatus(doc.status as Parameters<typeof effectiveQuoteStatus>[0], doc.expiryDate) : doc.status;
    const frozen = doc.snapshot as unknown as DocumentSnapshot | null;
    const customer = frozen ? { ...doc.customer, ...frozen.customer, companyName: frozen.customer.name } : doc.customer;
    return { ...doc, customer, dueDate: "expiryDate" in doc ? doc.expiryDate : "deliveryDate" in doc ? doc.deliveryDate : doc.dueDate, storedStatus: doc.status, status };
  }
  async get(actor: AuthenticatedUser, type: DocumentType, id: string) {
    this.authorize(actor); return this.output(type, await this.load(this.prisma, type, actor.companyId, id));
  }
  async list(actor: AuthenticatedUser, type: DocumentType, raw: unknown) {
    this.authorize(actor); const q = paginationQuerySchema.parse(raw);
    const common = { companyId: actor.companyId, customerId: q.customerId, createdAt: { gte: q.dateFrom, lte: q.dateTo },
      OR: q.search ? [{ number: { contains: q.search, mode: "insensitive" as const } }, { customer: { contactName: { contains: q.search, mode: "insensitive" as const } } }, { customer: { companyName: { contains: q.search, mode: "insensitive" as const } } }] : undefined };
    const options = { include: documentInclude, skip: (q.page-1)*q.pageSize, take: q.pageSize, orderBy: { createdAt: q.sortDirection } };
    let items: CommercialDocument[]; let total: number;
    if (type === "QUOTE") {
      const status = q.status ? z.enum(["DRAFT","SENT","ACCEPTED","REJECTED","EXPIRED","CANCELLED"]).parse(q.status) : undefined;
      const where: Prisma.QuoteWhereInput = { ...common, ...(status === "EXPIRED" ? { AND: [{ OR: [{ status: "EXPIRED" }, { status: "SENT", expiryDate: { lt: new Date() } }] }] } : { status }),
        ...(status === "SENT" ? { AND: [{ OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] }] } : {}) };
      [items, total] = await this.prisma.$transaction([this.prisma.quote.findMany({ ...options, where }), this.prisma.quote.count({ where })]);
    } else if (type === "INVOICE") {
      const status = q.status ? z.enum(["DRAFT","ISSUED","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED"]).parse(q.status) : undefined;
      const where: Prisma.InvoiceWhereInput = { ...common, ...(status === "OVERDUE" ? { status: { in: ["ISSUED","PARTIALLY_PAID","OVERDUE"] }, dueDate: { lt: new Date() }, remainingAmount: { gt: "0" } } : { status }),
        ...(["ISSUED","PARTIALLY_PAID"].includes(status ?? "") ? { AND: [{ OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }] }] } : {}) };
      [items, total] = await this.prisma.$transaction([this.prisma.invoice.findMany({ ...options, where }), this.prisma.invoice.count({ where })]);
    } else {
      const where: Prisma.DeliveryNoteWhereInput = { ...common, status: q.status ? z.enum(["DRAFT","CONFIRMED","DELIVERED","CANCELLED"]).parse(q.status) : undefined };
      [items, total] = await this.prisma.$transaction([this.prisma.deliveryNote.findMany({ ...options, where }), this.prisma.deliveryNote.count({ where })]);
    }
    return { items: items.map(doc => this.output(type, doc)), total, page: q.page, pageSize: q.pageSize };
  }
  private async validate(tx: Prisma.TransactionClient, actor: AuthenticatedUser, input: ParsedDocument) {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, companyId: actor.companyId, active: true } });
    if (!customer) throw new BadRequestException("Client actif introuvable.");
    if (input.dueDate && input.issueDate && input.dueDate < input.issueDate) throw new BadRequestException("L'echeance doit suivre la date d'emission.");
    const productIds = [...new Set(input.lines.flatMap(line => line.productId ? [line.productId] : []))];
    if (await tx.product.count({ where: { id: { in: productIds }, companyId: actor.companyId, status: "ACTIVE" } }) !== productIds.length) throw new BadRequestException("Une ligne contient un produit invalide.");
    const settings = await tx.businessSettings.findUniqueOrThrow({ where: { companyId: actor.companyId } });
    if (!settings.documentDiscountEnabled && scaled(input.documentDiscountRate) > 0n) throw new BadRequestException("La remise globale est desactivee.");
    const rates = Array.isArray(settings.taxRates) ? settings.taxRates.map(value => scaled(String(value), 2)) : [];
    if (input.lines.some(line => !rates.includes(scaled(line.taxRate, 2)))) throw new BadRequestException("Taux de TVA non configure.");
    const warehouse = input.warehouseId ? await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: actor.companyId, active: true } }) :
      await tx.warehouse.findFirst({ where: { companyId: actor.companyId, code: "MAIN", active: true } });
    if (!warehouse) throw new BadRequestException("Depot actif introuvable.");
    return { settings, warehouse };
  }
  private lineData(input: ParsedDocument, result: ReturnType<typeof calculateDocument>) {
    return result.lines.map((line, position) => ({ ...line, position, productId: input.lines[position]!.productId,
      description: input.lines[position]!.description, unit: input.lines[position]!.unit }));
  }
  async create(actor: AuthenticatedUser, type: DocumentType, body: unknown, key?: string) {
    this.authorize(actor); const input = documentSchema.parse(body);
    return this.mutations.run(actor, key, `document.${type}.create`, input, async tx => {
      const { settings, warehouse } = await this.validate(tx, actor, input);
      const calculation = calculateDocument(input);
      const data = { companyId: actor.companyId, customerId: input.customerId, createdById: actor.id, internalRef: `draft-${randomUUID()}`,
        issueDate: input.issueDate, notes: input.notes, terms: input.terms ?? settings.paymentTerms, documentDiscountRate: input.documentDiscountRate,
        subtotal: calculation.subtotal, discountAmount: calculation.discountAmount, taxAmount: calculation.taxAmount, total: calculation.total,
        lines: { create: this.lineData(input, calculation) } };
      const doc = type === "QUOTE" ? await tx.quote.create({ data: { ...data, expiryDate: input.dueDate }, include: documentInclude }) : type === "INVOICE" ?
        await tx.invoice.create({ data: { ...data, dueDate: input.dueDate, remainingAmount: calculation.total }, include: documentInclude }) :
        await tx.deliveryNote.create({ data: { ...data, warehouseId: warehouse.id, deliveryDate: input.dueDate }, include: documentInclude });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "document.created", entityType: type, entityId: doc.id, after: { total: calculation.total, status: "DRAFT" } }, tx);
      return doc;
    });
  }
  async update(actor: AuthenticatedUser, type: DocumentType, id: string, body: unknown, key?: string) {
    this.authorize(actor); const parsed = documentSchema.extend({ version: z.number().int().min(1) }).parse(body);
    const { version, ...input } = parsed;
    return this.mutations.run(actor, key, `document.${type}.update`, { id, ...parsed }, async tx => {
      await this.serial(tx, actor.companyId); const before = await this.load(tx, type, actor.companyId, id, true);
      if (before.status !== "DRAFT" || before.version !== version) throw new ConflictException("Document emis ou version obsolete. Actualisez avant de modifier.");
      const { warehouse } = await this.validate(tx, actor, input); const calculation = calculateDocument(input);
      const data = { customerId: input.customerId, issueDate: input.issueDate ?? null, notes: input.notes ?? null, terms: input.terms ?? null,
        documentDiscountRate: input.documentDiscountRate, subtotal: calculation.subtotal, discountAmount: calculation.discountAmount,
        taxAmount: calculation.taxAmount, total: calculation.total, version: { increment: 1 } };
      const lines = { deleteMany: {}, create: this.lineData(input, calculation) };
      const doc = type === "QUOTE" ? await tx.quote.update({ where: { id }, data: { ...data, expiryDate: input.dueDate ?? null, lines }, include: documentInclude }) : type === "INVOICE" ?
        await tx.invoice.update({ where: { id }, data: { ...data, dueDate: input.dueDate ?? null, remainingAmount: calculation.total, lines }, include: documentInclude }) :
        await tx.deliveryNote.update({ where: { id }, data: { ...data, deliveryDate: input.dueDate ?? null, warehouseId: warehouse.id, lines }, include: documentInclude });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "document.draft.updated", entityType: type, entityId: id,
        before: { version, total: before.total.toString() }, after: { version: doc.version, total: calculation.total } }, tx);
      return doc;
    });
  }
  async snapshot(tx: Prisma.TransactionClient, type: DocumentType, doc: CommercialDocument, number: string, issueDate: Date): Promise<DocumentSnapshot> {
    const company = await tx.company.findUniqueOrThrow({ where: { id: doc.companyId }, include: { businessSettings: true } });
    const customer = doc.customer;
    const dueDate = "dueDate" in doc ? doc.dueDate : "expiryDate" in doc ? doc.expiryDate : doc.deliveryDate;
    return { version: 1, type, documentId: doc.id, number, statusAtIssue: type === "QUOTE" ? "SENT" : type === "INVOICE" ? "ISSUED" : "CONFIRMED",
      issueDate: issueDate.toISOString(), dueDate: dueDate?.toISOString() ?? null, currency: company.currency, locale: company.locale, timezone: company.timezone,
      company: { name: company.name, legalName: company.legalName, taxIdentificationNumber: company.taxIdentificationNumber, email: company.email,
        phone: company.phone, address: company.address, logoAssetId: company.logoAssetId },
      customer: { name: customer.companyName ?? customer.contactName, contactName: customer.contactName, taxIdentificationNumber: customer.taxIdentificationNumber,
        email: customer.email, phone: customer.phone, billingAddress: customer.addresses.find(a => a.kind === "BILLING")?.rawText ?? "",
        deliveryAddress: customer.addresses.find(a => a.kind === "DELIVERY")?.rawText ?? "" },
      lines: doc.lines.map(line => ({ position: line.position, productId: line.productId, description: line.description, quantity: line.quantity.toFixed(3), unit: line.unit,
        unitPrice: line.unitPrice.toFixed(3), discountRate: line.discountRate.toFixed(2), taxRate: line.taxRate.toFixed(2), subtotal: line.subtotal.toFixed(3),
        discountAmount: line.discountAmount.toFixed(3), documentDiscountAmount: line.documentDiscountAmount.toFixed(3), taxableAmount: line.taxableAmount.toFixed(3),
        taxAmount: line.taxAmount.toFixed(3), total: line.total.toFixed(3) })),
      subtotal: doc.subtotal.toFixed(3), discountAmount: doc.discountAmount.toFixed(3), documentDiscountRate: doc.documentDiscountRate.toFixed(2), taxAmount: doc.taxAmount.toFixed(3),
      total: doc.total.toFixed(3), paidAmount: "paidAmount" in doc ? doc.paidAmount.toFixed(3) : "0.000", remainingAmount: "remainingAmount" in doc ? doc.remainingAmount.toFixed(3) : doc.total.toFixed(3),
      notes: doc.notes ?? "", terms: doc.terms ?? "", footer: company.businessSettings?.footerText ?? "Generated by AS TINO DEV" };
  }
  async issue(actor: AuthenticatedUser, type: DocumentType, id: string, key?: string) {
    this.authorize(actor);
    return this.mutations.run(actor, key, `document.${type}.issue`, { id }, async tx => {
      await this.serial(tx, actor.companyId); const doc = await this.load(tx, type, actor.companyId, id, true);
      if (doc.status !== "DRAFT") throw new ConflictException("Ce document a deja ete emis ou annule.");
      if (!doc.lines.length || !doc.customer.active) throw new BadRequestException("Verifiez les lignes et le client avant emission.");
      const issueDate = doc.issueDate ?? new Date();
      const dueDate = "dueDate" in doc ? doc.dueDate : "expiryDate" in doc ? doc.expiryDate : doc.deliveryDate;
      if (dueDate && dueDate < issueDate) throw new BadRequestException("L'echeance est anterieure a l'emission. Corrigez le brouillon.");
      const number = await this.numbering.allocate(tx, actor.companyId, type, issueDate);
      const snapshot = await this.snapshot(tx, type, doc, number, issueDate);
      const data = { number, issueDate, snapshot: json(snapshot), snapshotHash: digest(canonical(snapshot)), version: { increment: 1 } };
      if (type === "DELIVERY_NOTE") {
        if (!("warehouseId" in doc) || !doc.warehouseId) throw new BadRequestException("Depot requis.");
        // Stable product order prevents AB/BA deadlocks between multi-product deliveries.
        for (const line of [...doc.lines].sort((a,b) => (a.productId ?? "").localeCompare(b.productId ?? "") || a.position-b.position)) {
          if (!line.productId) continue;
          await this.stock.createMovementInTransaction(tx, actor, { productId: line.productId, warehouseId: doc.warehouseId,
            customerId: doc.customerId, deliveryNoteId: doc.id, type: "CUSTOMER_DELIVERY", quantity: line.quantity.toString(), note: `Livraison ${number}`,
            idempotencyKey: `delivery:${doc.id}:${line.id}` });
        }
      }
      const updated = type === "QUOTE" ? await tx.quote.update({ where: { id }, data: { ...data, status: "SENT" }, include: documentInclude }) : type === "INVOICE" ?
        await tx.invoice.update({ where: { id }, data: { ...data, status: scaled(doc.total.toString()) === 0n ? "PAID" : "ISSUED" }, include: documentInclude }) :
        await tx.deliveryNote.update({ where: { id }, data: { ...data, status: "CONFIRMED", stockDeductedAt: new Date() }, include: documentInclude });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "document.issued", entityType: type, entityId: id,
        before: { status: "DRAFT" }, after: { status: updated.status, number, snapshotHash: data.snapshotHash } }, tx);
      return updated;
    });
  }
  async transition(actor: AuthenticatedUser, type: DocumentType, id: string, status: "ACCEPTED" | "REJECTED" | "DELIVERED", key?: string) {
    this.authorize(actor);
    return this.mutations.run(actor, key, `document.${type}.${status}`, { id }, async tx => {
      await this.serial(tx, actor.companyId); const doc = await this.load(tx, type, actor.companyId, id, true);
      const allowed = type === "QUOTE" && "expiryDate" in doc && ["ACCEPTED","REJECTED"].includes(status) ?
        canTransitionQuote(effectiveQuoteStatus(doc.status as Parameters<typeof effectiveQuoteStatus>[0], doc.expiryDate), status as "ACCEPTED" | "REJECTED") :
        type === "DELIVERY_NOTE" && status === "DELIVERED" && canTransitionDeliveryNote(doc.status as Parameters<typeof canTransitionDeliveryNote>[0], status);
      if (!allowed) throw new ConflictException("Transition impossible pour ce statut.");
      const result = type === "QUOTE" ? await tx.quote.update({ where: { id }, data: { status: status as "ACCEPTED" | "REJECTED", version: { increment: 1 } }, include: documentInclude }) :
        await tx.deliveryNote.update({ where: { id }, data: { status: "DELIVERED", version: { increment: 1 } }, include: documentInclude });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "document.status.changed", entityType: type, entityId: id,
        before: { status: doc.status }, after: { status } }, tx);
      return result;
    });
  }
  private copyLines(doc: CommercialDocument) {
    return doc.lines.map(line => ({ position: line.position, productId: line.productId, description: line.description, quantity: line.quantity,
      unit: line.unit, unitPrice: line.unitPrice, discountRate: line.discountRate, taxRate: line.taxRate, subtotal: line.subtotal,
      discountAmount: line.discountAmount, documentDiscountAmount: line.documentDiscountAmount, taxableAmount: line.taxableAmount, taxAmount: line.taxAmount, total: line.total }));
  }
  async convert(actor: AuthenticatedUser, sourceType: DocumentType, id: string, target: DocumentType, key?: string) {
    this.authorize(actor);
    if (!((sourceType === "QUOTE" && ["QUOTE","INVOICE","DELIVERY_NOTE"].includes(target)) || (sourceType === "DELIVERY_NOTE" && target === "INVOICE")))
      throw new BadRequestException("Conversion non prise en charge.");
    return this.mutations.run(actor, key, `document.${sourceType}.convert.${target}`, { id }, async tx => {
      await this.serial(tx, actor.companyId); const source = await this.load(tx, sourceType, actor.companyId, id, true);
      if (target !== "QUOTE" && (sourceType === "QUOTE" ? source.status !== "ACCEPTED" : !["CONFIRMED","DELIVERED"].includes(source.status))) throw new ConflictException("Acceptez le devis ou confirmez la livraison avant conversion.");
      const quoteId = sourceType === "QUOTE" ? source.id : "quoteId" in source ? source.quoteId : null;
      if (target === "INVOICE") {
        const existing = await tx.invoice.findFirst({ where: { companyId: actor.companyId, OR: [
          ...(quoteId ? [{ quoteId }] : []), ...(sourceType === "DELIVERY_NOTE" ? [{ deliveryNoteId: id }] : [])] }, include: documentInclude });
        if (existing) return existing;
      }
      if (target === "DELIVERY_NOTE") {
        const existing = await tx.deliveryNote.findUnique({ where: { quoteId: id }, include: documentInclude });
        if (existing) return existing;
      }
      const common = { companyId: actor.companyId, customerId: source.customerId, createdById: actor.id, internalRef: `draft-${randomUUID()}`,
        notes: source.notes, terms: source.terms, documentDiscountRate: source.documentDiscountRate, subtotal: source.subtotal,
        discountAmount: source.discountAmount, taxAmount: source.taxAmount, total: source.total, lines: { create: this.copyLines(source) } };
      const warehouse = target === "DELIVERY_NOTE" ? await tx.warehouse.findFirst({ where: { companyId: actor.companyId, code: "MAIN", active: true } }) : null;
      if (target === "DELIVERY_NOTE" && !warehouse) throw new BadRequestException("Depot principal requis.");
      const result = target === "QUOTE" ? await tx.quote.create({ data: common, include: documentInclude }) : target === "INVOICE" ?
        await tx.invoice.create({ data: { ...common, quoteId, deliveryNoteId: sourceType === "DELIVERY_NOTE" ? id : undefined, remainingAmount: source.total }, include: documentInclude }) :
        await tx.deliveryNote.create({ data: { ...common, quoteId: id, warehouseId: warehouse!.id }, include: documentInclude });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "document.converted", entityType: target, entityId: result.id,
        after: { sourceType, sourceId: source.id, targetType: target, targetId: result.id } }, tx);
      return result;
    });
  }
  async cancel(actor: AuthenticatedUser, type: DocumentType, id: string, body: unknown, key?: string) {
    this.authorize(actor); const input = reasonSchema.parse(body);
    return this.mutations.run(actor, key, `document.${type}.cancel`, { id, ...input }, async tx => {
      await this.serial(tx, actor.companyId); const doc = await this.load(tx, type, actor.companyId, id, true);
      const allowed = type === "QUOTE" ? canTransitionQuote(doc.status as Parameters<typeof canTransitionQuote>[0], "CANCELLED") :
        type === "INVOICE" ? canTransitionInvoice(doc.status as Parameters<typeof canTransitionInvoice>[0], "CANCELLED") :
        canTransitionDeliveryNote(doc.status as Parameters<typeof canTransitionDeliveryNote>[0], "CANCELLED");
      if (!allowed) throw new ConflictException("Ce document ne peut pas etre annule.");
      if (type === "INVOICE" && await tx.payment.count({ where: { invoiceId: id, cancelledAt: null } })) throw new ConflictException("Annulez les reglements avec justification avant la facture.");
      if (type === "QUOTE" && (await tx.invoice.count({ where: { quoteId: id, status: { not: "CANCELLED" } } }) || await tx.deliveryNote.count({ where: { quoteId: id, status: { not: "CANCELLED" } } }))) throw new ConflictException("Annulez d'abord les documents lies.");
      if (type === "DELIVERY_NOTE") {
        const relatedQuote = "quoteId" in doc ? doc.quoteId : null;
        if (await tx.invoice.count({ where: { companyId: actor.companyId, status: { not: "CANCELLED" }, OR: [{ deliveryNoteId: id }, ...(relatedQuote ? [{ quoteId: relatedQuote }] : [])] } }))
          throw new ConflictException("Annulez d'abord la facture liee a cette livraison ou a son devis.");
        const movements = await tx.stockMovement.findMany({ where: { deliveryNoteId: id, type: "CUSTOMER_DELIVERY" }, orderBy: [{ productId: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
        for (const movement of movements) await this.stock.reverseInTransaction(tx, actor, movement.id, `cancel-delivery:${id}:${movement.id}`, input.reason);
      }
      const data = { status: "CANCELLED" as const, cancellationReason: input.reason, cancelledAt: new Date(), version: { increment: 1 } };
      const result = type === "QUOTE" ? await tx.quote.update({ where: { id }, data, include: documentInclude }) : type === "INVOICE" ?
        await tx.invoice.update({ where: { id }, data, include: documentInclude }) : await tx.deliveryNote.update({ where: { id }, data, include: documentInclude });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "document.cancelled", entityType: type, entityId: id,
        before: { status: doc.status }, after: { status: "CANCELLED" }, reason: input.reason }, tx);
      return result;
    });
  }
  async registerPayment(actor: AuthenticatedUser, body: unknown) {
    assertCan(actor, Permissions.PaymentManage); assertCan(actor, Permissions.FinancialRead); const input = paymentSchema.parse(body);
    if (input.paidAt && input.paidAt.getTime() > Date.now() + 300_000) throw new BadRequestException("Un reglement ne peut pas etre date dans le futur.");
    return this.mutations.run(actor, input.idempotencyKey, "payment.create", input, async tx => {
      const invoice = await this.load(tx, "INVOICE", actor.companyId, input.invoiceId, true);
      if (!("paidAmount" in invoice) || ["DRAFT","CANCELLED","PAID"].includes(invoice.status)) throw new ConflictException("Cette facture ne peut pas recevoir de reglement.");
      let balance;
      try { balance = calculatePayment(invoice.total.toString(), invoice.paidAmount.toString(), input.amount); }
      catch { throw new ConflictException("Montant invalide ou superieur au solde restant."); }
      const payment = await tx.payment.create({ data: { ...input, companyId: actor.companyId, customerId: invoice.customerId, receivedById: actor.id } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { ...balance, version: { increment: 1 } } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "payment.created", entityType: "Payment", entityId: payment.id,
        after: { invoiceId: invoice.id, amount: input.amount, remainingAmount: balance.remainingAmount, method: input.method } }, tx);
      return { payment, balance };
    });
  }
  async cancelPayment(actor: AuthenticatedUser, id: string, body: unknown, key?: string) {
    assertCan(actor, Permissions.PaymentManage); assertCan(actor, Permissions.FinancialRead); const input = reasonSchema.parse(body);
    return this.mutations.run(actor, key, "payment.cancel", { id, ...input }, async tx => {
      const hint = await tx.payment.findFirst({ where: { id, companyId: actor.companyId } });
      if (!hint) throw new NotFoundException("Reglement introuvable.");
      const invoice = await this.load(tx, "INVOICE", actor.companyId, hint.invoiceId, true);
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${id} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (payment.cancelledAt || !("paidAmount" in invoice)) throw new ConflictException("Ce reglement est deja annule.");
      const paid = scaled(invoice.paidAmount.toString()) - scaled(payment.amount.toString());
      const remaining = scaled(invoice.total.toString()) - paid;
      const balance = { paidAmount: formatScaled(paid), remainingAmount: formatScaled(remaining), status: remaining === 0n ? "PAID" as const : paid > 0n ? "PARTIALLY_PAID" as const : "ISSUED" as const };
      await tx.payment.update({ where: { id }, data: { cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: input.reason } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { ...balance, version: { increment: 1 } } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "payment.cancelled", entityType: "Payment", entityId: id,
        before: { amount: payment.amount.toString() }, after: balance, reason: input.reason }, tx);
      return { ok: true, balance };
    });
  }
  async listPayments(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.PaymentManage); assertCan(actor, Permissions.FinancialRead); const q = paginationQuerySchema.parse(raw);
    const where: Prisma.PaymentWhereInput = { companyId: actor.companyId, customerId: q.customerId, receivedById: q.userId, paidAt: { gte: q.dateFrom, lte: q.dateTo },
      cancelledAt: q.status === "CANCELLED" ? { not: null } : q.status === "ACTIVE" ? null : undefined };
    const [items, total] = await this.prisma.$transaction([this.prisma.payment.findMany({ where, skip: (q.page-1)*q.pageSize, take: q.pageSize,
      include: { invoice: { select: { id: true, number: true, remainingAmount: true } }, customer: { select: { contactName: true, companyName: true } }, receivedBy: { select: { name: true } } }, orderBy: { paidAt: q.sortDirection } }), this.prisma.payment.count({ where })]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async queueEmail(actor: AuthenticatedUser, type: DocumentType, id: string, key?: string) {
    this.authorize(actor);
    return this.mutations.run(actor, key, `document.${type}.email`, { id }, async tx => {
      const doc = await this.load(tx, type, actor.companyId, id, true);
      if (!doc.snapshot || ["DRAFT","CANCELLED"].includes(doc.status)) throw new ConflictException("Emettez le document avant l'envoi.");
      const recipient = (doc.snapshot as unknown as DocumentSnapshot).customer.email;
      if (!recipient) throw new BadRequestException("Aucune adresse email dans l'instantane du client. Telechargez le PDF ou creez un nouveau document corrige.");
      const job = await tx.mailOutbox.create({ data: { companyId: actor.companyId, documentType: type, documentId: id, recipient } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "document.email.queued", entityType: type, entityId: id, after: { jobId: job.id } }, tx);
      return { jobId: job.id, status: job.status };
    });
  }
  async emailStatus(actor: AuthenticatedUser, type: DocumentType, id: string) {
    this.authorize(actor); await this.load(this.prisma, type, actor.companyId, id);
    return this.prisma.mailOutbox.findMany({ where: { companyId: actor.companyId, documentType: type, documentId: id }, select: { id: true, status: true, attempts: true, createdAt: true, sentAt: true, lastError: true }, orderBy: { createdAt: "desc" }, take: 20 });
  }
}
