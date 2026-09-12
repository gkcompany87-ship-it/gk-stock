import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { cookieNames, sessionSelector, validCsrf } from "../auth/cookies.js";
import { constantEqual } from "./json.js";
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
    const origins = this.config.getOrThrow<string>("API_ALLOWED_ORIGINS").split(",").map(o => o.trim());
    const token = req.headers["x-csrf-token"];
    const cookie = req.cookies[cookieNames(this.config).csrf];
    // Public authentication routes are intentionally NOT exempt, including login and refresh.
    if (!req.headers.origin || !origins.includes(req.headers.origin) || typeof token !== "string" || !cookie ||
        !constantEqual(token, cookie) || !validCsrf(token, sessionSelector(req, this.config), this.config))
      throw new ForbiddenException("Verification CSRF echouee. Actualisez la session.");
    return true;
  }
}
