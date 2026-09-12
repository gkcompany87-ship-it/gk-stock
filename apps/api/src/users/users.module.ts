import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { RolesController } from "./roles.controller.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [AuditModule],
  controllers: [UsersController, RolesController],
  providers: [UsersService]
})
export class UsersModule {}
