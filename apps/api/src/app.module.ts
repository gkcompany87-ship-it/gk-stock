import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { StorageModule } from "./pdf/storage.module.js";
import { CoreModule } from "./common/core.module.js";
import { LoggerModule } from "nestjs-pino";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthGuard } from "./auth/jwt-auth.guard.js";
import { CsrfGuard } from "./common/csrf.guard.js";
import { PermissionsGuard } from "./common/permissions.guard.js";
import { CustomersModule } from "./customers/customers.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { HealthModule } from "./health/health.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProductsModule } from "./products/products.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { StockModule } from "./stock/stock.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        redact: ["req.headers.cookie", "req.headers.authorization", "res.headers.set-cookie"]
      }
    }),
    PrismaModule,
    CoreModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    StockModule,
    CustomersModule,
    DocumentsModule,
    PaymentsModule,
    ReportsModule,
    SettingsModule,
    HealthModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard }
  ]
})
export class AppModule {}
