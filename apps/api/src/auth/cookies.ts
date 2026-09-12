import { createHmac, randomBytes } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { constantEqual } from "../common/json.js";
export function cookieNames(config: ConfigService) {
  const prefix = config.get("NODE_ENV") === "production" ? "__Host-" : "";
  return { access: `${prefix}as_tino_access`, refresh: `${prefix}as_tino_refresh`, csrf: `${prefix}as_tino_csrf` };
}
export function sessionSelector(request: FastifyRequest, config: ConfigService): string {
  return request.cookies[cookieNames(config).refresh]?.split(".")[0] ?? "anonymous";
}
export function csrfToken(selector: string, config: ConfigService): string {
  const nonce = randomBytes(32).toString("base64url");
  return `${nonce}.${createHmac("sha256", config.getOrThrow<string>("COOKIE_SECRET")).update(`${selector}:${nonce}`).digest("base64url")}`;
}
export function validCsrf(token: string, selector: string, config: ConfigService): boolean {
  const [nonce, mac, extra] = token.split(".");
  if (!nonce || !mac || extra || nonce.length !== 43) return false;
  const expected = createHmac("sha256", config.getOrThrow<string>("COOKIE_SECRET")).update(`${selector}:${nonce}`).digest("base64url");
  return constantEqual(mac, expected);
}
export function setCsrf(reply: FastifyReply, selector: string, config: ConfigService) {
  const token = csrfToken(selector, config);
  reply.setCookie(cookieNames(config).csrf, token, { httpOnly: true, secure: config.get("NODE_ENV") === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  reply.header("Cache-Control", "no-store");
  return token;
}
