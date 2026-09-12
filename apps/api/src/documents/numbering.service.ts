import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, type DocumentType } from "@prisma/client";
import { formatDocumentNumber } from "@as-tino/shared";
@Injectable()
export class NumberingService {
  async allocate(tx: Prisma.TransactionClient, companyId: string, type: DocumentType, issueDate: Date) {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, include: { businessSettings: true } });
    const settings = company.businessSettings;
    if (!settings) throw new Error("Missing business settings");
    const year = Number(new Intl.DateTimeFormat("en", { timeZone: company.timezone, year: "numeric" }).format(issueDate));
    const prefix = type === "QUOTE" ? settings.quotePrefix : type === "INVOICE" ? settings.invoicePrefix : settings.deliveryNotePrefix;
    const rows = await tx.$queryRaw<{ prefix: string; allocated: number }[]>(Prisma.sql`
      INSERT INTO "DocumentSequence" (id,"companyId","documentType",year,prefix,"nextNumber","updatedAt")
      VALUES (${randomUUID()},${companyId},${type}::"DocumentType",${year},${prefix},2,now())
      ON CONFLICT ("companyId","documentType",year) DO UPDATE SET "nextNumber"="DocumentSequence"."nextNumber"+1,"updatedAt"=now()
      RETURNING prefix,"nextNumber"-1 AS allocated`);
    if (!rows[0]) throw new Error("Number allocation failed");
    // Existing annual series retain their prefix. Configuration applies to newly opened series.
    return formatDocumentNumber(rows[0].prefix, year, rows[0].allocated);
  }
}
