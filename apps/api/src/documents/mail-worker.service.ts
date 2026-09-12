import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import type { MailOutbox } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailerService } from "../common/mailer.service.js";
import { DocumentPdfService } from "../pdf/document-pdf.service.js";
import { AuditService } from "../audit/audit.service.js";
@Injectable()
export class MailWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MailWorkerService.name);
  private timer?: ReturnType<typeof setInterval>; private busy = false;
  constructor(private readonly prisma: PrismaService, private readonly mail: MailerService, private readonly pdf: DocumentPdfService, private readonly audit: AuditService) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.tick().catch(() => this.logger.error("Document mail worker unavailable")); }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const job = await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<MailOutbox[]>`SELECT * FROM "MailOutbox" WHERE attempts<5 AND "nextAttemptAt"<=now() AND (status IN ('PENDING','FAILED') OR (status='SENDING' AND "lockedUntil"<now())) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!rows[0]) return null;
        return tx.mailOutbox.update({ where: { id: rows[0].id }, data: { status: "SENDING", attempts: { increment: 1 }, lockedUntil: new Date(Date.now()+120_000) } });
      });
      if (!job) return;
      try {
        const pdf = await this.pdf.forQueuedJob(job.companyId, job.documentType, job.documentId);
        const company = await this.prisma.company.findUnique({ where: { id: job.companyId }, select: { name: true } });
        const senderName = company?.name ?? "Votre entreprise";
        await this.mail.send(job.recipient, `Votre document ${pdf.filename.replace(/\.pdf$/, "")}`, `Bonjour,\n\nVeuillez trouver votre document commercial en pièce jointe.\n\nCordialement,\n${senderName}`, { filename: pdf.filename, content: pdf.buffer }, `<${job.id}@gk-stock.local>`);
        await this.prisma.$transaction(async tx => {
          await tx.mailOutbox.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date(), lockedUntil: null, lastError: null } });
          await this.audit.record({ companyId: job.companyId, action: "document.email.sent", entityType: job.documentType, entityId: job.documentId, after: { jobId: job.id } }, tx);
        });
      } catch {
        await this.prisma.mailOutbox.update({ where: { id: job.id }, data: { status: "FAILED", lockedUntil: null, nextAttemptAt: new Date(Date.now()+Math.min(3600, 30 * 2 ** job.attempts)*1000), lastError: "Envoi non confirme. Verifiez le document, le stockage, Chromium et SMTP." } });
      }
    } finally { this.busy = false; }
  }
}
