import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { RedisService } from "../common/redis.service.js";
import { digest } from "../common/json.js";
@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (req.method !== "POST") return true;
    const route = req.routeOptions.url ?? req.url.split("?")[0] ?? "auth";
    const limit = route.includes("password-reset") ? 3 : route.includes("refresh") ? 30 : 10;
    if (await this.redis.limit(`auth:${digest(req.ip)}:${route}`, 60_000) > limit)
      throw new HttpException("Trop de tentatives. Reessayez dans une minute.", 429);
    return true;
  }
}
