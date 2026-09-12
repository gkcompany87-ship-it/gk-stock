import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";

@Module({
  imports: [AuditModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService]
})
export class CustomersModule {}
