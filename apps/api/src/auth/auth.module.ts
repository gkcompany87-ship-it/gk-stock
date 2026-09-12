import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuditModule } from "../audit/audit.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthRateGuard } from "./auth-rate.guard.js";
import { AuthService } from "./auth.service.js";

@Module({
  imports: [
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("ACCESS_TOKEN_SECRET"),
        signOptions: { expiresIn: "15m" }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRateGuard],
  exports: [AuthService, JwtModule]
})
export class AuthModule {}
