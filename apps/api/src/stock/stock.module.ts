import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { ProductsModule } from "../products/products.module.js";
import { ScanController } from "./scan.controller.js";
import { StockController } from "./stock.controller.js";
import { StockService } from "./stock.service.js";

@Module({
  imports: [AuditModule, ProductsModule],
  controllers: [StockController, ScanController],
  providers: [StockService],
  exports: [StockService]
})
export class StockModule {}
