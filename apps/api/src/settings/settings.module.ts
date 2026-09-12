import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService]
})
export class SettingsModule {}
