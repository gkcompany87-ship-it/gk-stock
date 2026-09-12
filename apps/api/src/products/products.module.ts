import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { CategoriesController } from "./categories.controller.js";
import { ProductsController } from "./products.controller.js";
import { ProductsService } from "./products.service.js";
import { WarehousesController } from "./warehouses.controller.js";

@Module({
  imports: [AuditModule],
  controllers: [ProductsController, CategoriesController, WarehousesController],
  providers: [ProductsService],
  exports: [ProductsService]
})
export class ProductsModule {}
