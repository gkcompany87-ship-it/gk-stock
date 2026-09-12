import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { MailerService } from "../common/mailer.service.js";
import { constantEqual, digest } from "../common/json.js";
import type { AuthenticatedUser } from "../common/current-user.js";
export const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
const loginSchema = z.object({ email: z.string().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(1).max(128) }).strict();
const resetSchema = z.object({ token: z.string().min(60).max(200), password: z.string().min(12).max(128) }).strict();
const userInclude = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } as const;
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService,
    private readonly audit: AuditService, private readonly mail: MailerService) {}
  private async company() { return this.prisma.company.findUniqueOrThrow({ where: { slug: this.config.getOrThrow<string>("COMPANY_SLUG") } }); }
  async principal(userId: string, tx: Prisma.TransactionClient = this.prisma): Promise<AuthenticatedUser> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
    return { id: user.id, companyId: user.companyId, email: user.email, name: user.name,
      roles: user.roles.map(r => r.role.code), permissions: [...new Set(user.roles.flatMap(r => r.role.permissions.map(p => p.permission.code)))] };
  }
  private async tokens(user: Pick<User, "id" | "companyId">, tx: Prisma.TransactionClient, meta: { familyId?: string; rotatedFromId?: string; userAgent?: string; ipAddress?: string; expiresAt?: Date } = {}) {
    const id = randomUUID(); const secret = randomBytes(48).toString("base64url"); const familyId = meta.familyId ?? randomUUID();
    await tx.refreshSession.create({ data: { id, userId: user.id, familyId, tokenHash: digest(secret), rotatedFromId: meta.rotatedFromId,
      userAgent: meta.userAgent?.slice(0, 500), ipAddress: this.config.get("AUDIT_STORE_IP") === "true" ? meta.ipAddress : undefined,
      expiresAt: meta.expiresAt ?? new Date(Date.now() + 30 * 86400_000) } });
    const accessToken = await this.jwt.signAsync({ sub: user.id, companyId: user.companyId, sid: familyId },
      { issuer: "as-tino-stock", audience: "as-tino-web", algorithm: "HS256", expiresIn: "10m" });
    return { accessToken, refreshToken: `${id}.${secret}`, user: await this.principal(user.id, tx) };
  }
  async login(body: unknown, meta: { userAgent?: string; ipAddress?: string }) {
    const input = loginSchema.parse(body); const company = await this.company();
    const candidate = await this.prisma.user.findUnique({ where: { companyId_email: { companyId: company.id, email: input.email } } });
    if (!candidate) {
      this.dummyHash ??= argon2.hash(randomBytes(32), passwordOptions);
      await argon2.verify(await this.dummyHash, input.password);
      await this.audit.record({ companyId: company.id, action: "auth.login.failed", entityType: "User", after: { emailDigest: digest(input.email) } });
      throw new UnauthorizedException("Identifiants invalides ou compte temporairement indisponible.");
    }
    const result = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${candidate.id} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: candidate.id } });
      const valid = await argon2.verify(user.passwordHash, input.password);
      const locked = user.lockoutUntil !== null && user.lockoutUntil > new Date();
      if (!valid || locked || user.status !== "ACTIVE") {
        if (!locked && user.status === "ACTIVE") {
          const attempts = (user.lockoutUntil && user.lockoutUntil < new Date() ? 0 : user.failedLoginCount) + 1;
          await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: attempts, lockoutUntil: attempts >= 5 ? new Date(Date.now() + 900_000) : null } });
        }
        await this.audit.record({ companyId: user.companyId, actorId: user.id, action: "auth.login.failed", entityType: "User", entityId: user.id }, tx);
        return null; // Commit failed-attempt counters and audit before returning an error.
      }
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockoutUntil: null, lastLoginAt: new Date() } });
      const tokens = await this.tokens(user, tx, meta);
      await this.audit.record({ companyId: user.companyId, actorId: user.id, action: "auth.login.succeeded", entityType: "User", entityId: user.id }, tx);
      return tokens;
    }, { timeout: 20_000 });
    if (!result) throw new UnauthorizedException("Identifiants invalides ou compte temporairement indisponible.");
    return result;
  }
  async refresh(token: string | undefined) {
    const [id, secret, extra] = (token ?? "").split(".");
    if (!id || !secret || extra) throw new UnauthorizedException("Session invalide.");
    const result = await this.prisma.$transaction(async tx => {
      const hint = await tx.refreshSession.findUnique({ where: { id } });
      if (!hint) return null;
      // Always lock User before Session, consistent with password reset/deactivation.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${hint.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id=${id} FOR UPDATE`;
      const session = await tx.refreshSession.findUniqueOrThrow({ where: { id }, include: { user: true } });
      if (!constantEqual(session.tokenHash, digest(secret))) return null;
      if (session.revokedAt) {
        await tx.refreshSession.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        await this.audit.record({ companyId: session.user.companyId, actorId: session.userId, action: "auth.refresh.reuse", entityType: "User", entityId: session.userId }, tx);
        return null;
      }
      if (session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;
      await tx.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
      return this.tokens(session.user, tx, { familyId: session.familyId, rotatedFromId: id, expiresAt: session.expiresAt,
        userAgent: session.userAgent ?? undefined, ipAddress: session.ipAddress ?? undefined });
    });
    if (!result) throw new UnauthorizedException("Session expiree ou revoquee. Reconnectez-vous.");
    return result;
  }
  async logout(actor: AuthenticatedUser) {
    await this.prisma.$transaction(async tx => {
      await tx.refreshSession.updateMany({ where: { userId: actor.id, familyId: actor.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "auth.logout", entityType: "User", entityId: actor.id }, tx);
    });
  }
  async requestPasswordReset(body: unknown) {
    const input = z.object({ email: z.string().email().max(254) }).strict().parse(body);
    const company = await this.company();
    const user = await this.prisma.user.findUnique({ where: { companyId_email: { companyId: company.id, email: input.email.toLowerCase() } } });
    if (user?.status === "ACTIVE") {
      const id = randomUUID(); const secret = randomBytes(48).toString("base64url");
      await this.prisma.passwordResetToken.create({ data: { id, userId: user.id, tokenHash: digest(secret), expiresAt: new Date(Date.now() + 1800_000) } });
      const url = new URL("/reinitialiser-mot-de-passe", this.config.getOrThrow<string>("PUBLIC_APP_URL"));
      url.hash = `token=${id}.${secret}`; // Fragment avoids reverse-proxy access logs and Referrer headers.
      try { await this.mail.send(user.email, "Réinitialisation du mot de passe - G&K Stock", `Ouvrez ce lien dans les 30 minutes :\n${url.toString()}\n\nIgnorez ce message si vous n'avez pas fait cette demande.`); }
      catch { this.logger.error("Password reset email delivery failed; credentials and tokens omitted."); }
      await this.audit.record({ companyId: user.companyId, actorId: user.id, action: "auth.reset.requested", entityType: "User", entityId: user.id });
    }
    return { message: "Si ce compte existe, un lien de reinitialisation sera envoye." };
  }
  async resetPassword(body: unknown) {
    const input = resetSchema.parse(body); const [id, secret, extra] = input.token.split(".");
    if (!id || !secret || extra) throw new UnauthorizedException("Lien invalide ou expire.");
    const passwordHash = await argon2.hash(input.password, passwordOptions);
    const ok = await this.prisma.$transaction(async tx => {
      const hint = await tx.passwordResetToken.findUnique({ where: { id } });
      if (!hint) return false;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${hint.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "PasswordResetToken" WHERE id=${id} FOR UPDATE`;
      const token = await tx.passwordResetToken.findUniqueOrThrow({ where: { id }, include: { user: true } });
      if (token.usedAt || token.expiresAt <= new Date() || token.user.status !== "ACTIVE" || !constantEqual(token.tokenHash, digest(secret))) return false;
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash, failedLoginCount: 0, lockoutUntil: null } });
      await tx.passwordResetToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.refreshSession.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ companyId: token.user.companyId, actorId: token.userId, action: "auth.reset.completed", entityType: "User", entityId: token.userId }, tx);
      return true;
    });
    if (!ok) throw new UnauthorizedException("Lien invalide ou expire.");
    return { ok: true };
  }
}
