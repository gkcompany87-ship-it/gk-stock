import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { Public } from "../common/public.decorator.js";
import { AuthService } from "./auth.service.js";
import { AuthRateGuard } from "./auth-rate.guard.js";
import { cookieNames, sessionSelector, setCsrf, validCsrf } from "./cookies.js";
@ApiTags("Authentification")
@Controller({ path: "auth", version: "1" })
@UseGuards(AuthRateGuard)
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}
  @Public() @Get("csrf")
  csrf(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const selector = sessionSelector(request, this.config);
    const current = request.cookies[cookieNames(this.config).csrf];
    reply.header("Cache-Control", "no-store");
    return { csrfToken: current && validCsrf(current, selector, this.config) ? current : setCsrf(reply, selector, this.config) };
  }
  @Public() @Post("login") @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.login(body, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
    return this.cookies(reply, result);
  }
  @Public() @Post("refresh") @HttpCode(200)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.cookies(reply, await this.auth.refresh(req.cookies[cookieNames(this.config).refresh]));
  }
  @Get("me") me(@CurrentUser() user: AuthenticatedUser) { return { user }; }
  @Post("logout") @HttpCode(200)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(user);
    for (const name of Object.values(cookieNames(this.config))) reply.clearCookie(name, { path: "/", secure: this.config.get("NODE_ENV") === "production", sameSite: "lax" });
    return { ok: true };
  }
  @Public() @Post("password-reset") @HttpCode(202)
  requestReset(@Body() body: unknown) { return this.auth.requestPasswordReset(body); }
  @Public() @Post("password-reset/confirm") @HttpCode(200)
  reset(@Body() body: unknown) { return this.auth.resetPassword(body); }
  private cookies(reply: FastifyReply, result: { accessToken: string; refreshToken: string; user: AuthenticatedUser }) {
    const names = cookieNames(this.config); const options = { httpOnly: true, secure: this.config.get("NODE_ENV") === "production", sameSite: "lax" as const, path: "/" };
    reply.setCookie(names.access, result.accessToken, { ...options, maxAge: 600 });
    reply.setCookie(names.refresh, result.refreshToken, { ...options, maxAge: 30 * 86400 });
    return { user: result.user, csrfToken: setCsrf(reply, result.refreshToken.split(".")[0]!, this.config) };
  }
}
