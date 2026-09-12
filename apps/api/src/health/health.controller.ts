import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { Public } from "../common/public.decorator.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../common/redis.service.js";
import { FileStorageService } from "../pdf/file-storage.service.js";
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService, private readonly storage: FileStorageService, private readonly config: ConfigService) {}
  @Public() @Get() live() { return { status: "ok", service: "as-tino-api" }; }
  @Public() @Get("ready") async ready() {
    const checks = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.ping(), this.storage.health(), access(this.config.getOrThrow<string>("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"), constants.X_OK)]);
    if (checks.some(check => check.status === "rejected")) throw new ServiceUnavailableException("Un service requis est indisponible.");
    return { status: "ready", database: "ok", redis: "ok", storage: "ok", chromiumExecutable: "ok" };
  }
}
