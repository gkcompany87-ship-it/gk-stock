import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { StockModule } from "../stock/stock.module.js";
import { DeliveryNotesController } from "./delivery-notes.controller.js";
import { DocumentsService } from "./documents.service.js";
import { InvoicesController } from "./invoices.controller.js";
import { QuotesController } from "./quotes.controller.js";
import { MailWorkerService } from "./mail-worker.service.js";
import { NumberingService } from "./numbering.service.js";
import { DocumentPdfService } from "../pdf/document-pdf.service.js";
import { PdfService } from "../pdf/pdf.service.js";

@Module({
  imports: [AuditModule, StockModule],
  controllers: [QuotesController, InvoicesController, DeliveryNotesController],
  providers: [DocumentsService, NumberingService, PdfService, DocumentPdfService, MailWorkerService],
  exports: [DocumentsService]
})
export class DocumentsModule {}
