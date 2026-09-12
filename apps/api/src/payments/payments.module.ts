import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module.js";
import { PaymentsController } from "./payments.controller.js";

@Module({
  imports: [DocumentsModule],
  controllers: [PaymentsController]
})
export class PaymentsModule {}
