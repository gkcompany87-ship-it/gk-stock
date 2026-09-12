import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { IS_PUBLIC_KEY } from "../common/public.decorator.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { AuthService } from "./auth.service.js";
import { cookieNames } from "./cookies.js";
const claims = z.object({ sub: z.string(), companyId: z.string(), sid: z.string() });
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, private readonly prisma: PrismaService,
    private readonly config: ConfigService, private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest & { user: AuthenticatedUser }>();
    const token = request.cookies[cookieNames(this.config).access];
    if (!token) throw new UnauthorizedException("Connexion requise.");
    let payload: z.infer<typeof claims>;
    try { payload = claims.parse(await this.jwt.verifyAsync(token, { algorithms: ["HS256"], issuer: "as-tino-stock", audience: "as-tino-web" })); }
    catch { throw new UnauthorizedException("Session expiree."); }
    const user = await this.prisma.user.findFirst({ where: { id: payload.sub, companyId: payload.companyId, status: "ACTIVE",
      company: { slug: this.config.getOrThrow<string>("COMPANY_SLUG") },
      refreshSessions: { some: { familyId: payload.sid, revokedAt: null, expiresAt: { gt: new Date() } } } } });
    if (!user) throw new UnauthorizedException("Session revoquee.");
    request.user = { ...await this.auth.principal(user.id), sessionId: payload.sid };
    return true;
  }
}
