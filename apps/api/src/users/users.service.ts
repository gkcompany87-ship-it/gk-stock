import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Permissions, paginationSchema } from "@as-tino/shared";
import { Prisma } from "@prisma/client";
import argon2 from "argon2";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertCan } from "../common/access.js";
import { passwordOptions } from "../auth/auth.service.js";
import type { AuthenticatedUser } from "../common/current-user.js";

const safeSelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  lastLoginAt: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { include: { role: { select: { id: true, code: true, name: true } } } }
} as const;

const baseSchema = z.object({
  email: z.string().email().max(254).transform(s => s.toLowerCase()),
  name: z.string().trim().min(2).max(120),
  roleCodes: z.array(z.string().min(1).max(40)).min(1).max(10).refine(a => new Set(a).size === a.length)
}).strict();

const createSchema = baseSchema.extend({ password: z.string().min(12).max(128) });
const resetPasswordSchema = z.object({ password: z.string().min(12).max(128) }).strict();
const roleSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
  name: z.string().min(2).max(80),
  permissions: z.array(z.enum(Object.values(Permissions) as [string, ...string[]])).max(50)
}).strict();

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(actor: AuthenticatedUser, raw: unknown) {
    assertCan(actor, Permissions.UserManage);
    const q = paginationSchema.parse(raw);
    const where: Prisma.UserWhereInput = {
      companyId: actor.companyId,
      status: q.status ? z.enum(["ACTIVE", "INACTIVE"]).parse(q.status) : undefined,
      OR: q.search ? [
        { name: { contains: q.search, mode: "insensitive" } },
        { email: { contains: q.search, mode: "insensitive" } }
      ] : undefined
    };
    const companyWhere: Prisma.UserWhereInput = { companyId: actor.companyId };
    const [items, total, active, inactive] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: safeSelect,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }]
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...companyWhere, status: "ACTIVE" } }),
      this.prisma.user.count({ where: { ...companyWhere, status: "INACTIVE" } })
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, summary: { total: active + inactive, active, inactive } };
  }

  async roles(actor: AuthenticatedUser) {
    assertCan(actor, Permissions.UserManage);
    return this.prisma.role.findMany({
      where: { companyId: actor.companyId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: "asc" }
    });
  }

  private async validRoles(tx: Prisma.TransactionClient, companyId: string, codes: string[]) {
    const roles = await tx.role.findMany({ where: { companyId, code: { in: codes } } });
    if (roles.length !== codes.length) throw new BadRequestException("Role invalide.");
    return roles;
  }

  private async retainManager(tx: Prisma.TransactionClient, companyId: string) {
    const count = await tx.user.count({
      where: {
        companyId,
        status: "ACTIVE",
        roles: { some: { role: { permissions: { some: { permission: { code: Permissions.UserManage } } } } } }
      }
    });
    if (count === 0) throw new ConflictException("Conservez au moins un administrateur actif.");
  }

  private async ownedUser(tx: Prisma.TransactionClient, actor: AuthenticatedUser, id: string) {
    const user = await tx.user.findFirst({ where: { id, companyId: actor.companyId }, select: safeSelect });
    if (!user) throw new NotFoundException("Utilisateur introuvable.");
    return user;
  }

  async create(actor: AuthenticatedUser, body: unknown) {
    assertCan(actor, Permissions.UserManage);
    const input = createSchema.parse(body);
    const hash = await argon2.hash(input.password, passwordOptions);
    return this.prisma.$transaction(async tx => {
      const roles = await this.validRoles(tx, actor.companyId, input.roleCodes);
      const user = await tx.user.create({
        data: {
          companyId: actor.companyId,
          email: input.email,
          name: input.name,
          passwordHash: hash,
          roles: { create: roles.map(role => ({ roleId: role.id })) }
        },
        select: safeSelect
      });
      await this.audit.record({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "user.created",
        entityType: "User",
        entityId: user.id,
        after: { email: user.email, roles: input.roleCodes }
      }, tx);
      return user;
    });
  }

  async update(actor: AuthenticatedUser, id: string, body: unknown) {
    assertCan(actor, Permissions.UserManage);
    const input = baseSchema.partial().extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).strict().parse(body);
    if (id === actor.id && input.status === "INACTIVE") throw new BadRequestException("Vous ne pouvez pas desactiver votre compte.");
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.companyId + ':identity'},0))`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} AND "companyId"=${actor.companyId} FOR UPDATE`;
      const before = await this.ownedUser(tx, actor, id);
      const roles = input.roleCodes ? await this.validRoles(tx, actor.companyId, input.roleCodes) : undefined;
      if (roles) await tx.userRole.deleteMany({ where: { userId: id } });
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          status: input.status,
          deactivatedAt: input.status === "INACTIVE" ? new Date() : input.status === "ACTIVE" ? null : undefined,
          roles: roles ? { create: roles.map(role => ({ roleId: role.id })) } : undefined
        },
        select: safeSelect
      });
      if (input.status === "INACTIVE" || roles || input.email) {
        await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.retainManager(tx, actor.companyId);
      await this.audit.record({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "user.updated",
        entityType: "User",
        entityId: id,
        before,
        after: updated
      }, tx);
      return updated;
    });
  }

  async resetPassword(actor: AuthenticatedUser, id: string, body: unknown) {
    assertCan(actor, Permissions.UserManage);
    const input = resetPasswordSchema.parse(body);
    const hash = await argon2.hash(input.password, passwordOptions);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} AND "companyId"=${actor.companyId} FOR UPDATE`;
      const user = await this.ownedUser(tx, actor, id);
      await tx.user.update({
        where: { id },
        data: { passwordHash: hash, failedLoginCount: 0, lockoutUntil: null }
      });
      const revoked = await tx.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await this.audit.record({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "user.password.reset",
        entityType: "User",
        entityId: id,
        after: { email: user.email, sessionsRevoked: revoked.count }
      }, tx);
      return { ok: true, sessionsRevoked: revoked.count };
    });
  }

  async logoutAll(actor: AuthenticatedUser, id: string) {
    assertCan(actor, Permissions.UserManage);
    return this.prisma.$transaction(async tx => {
      const user = await this.ownedUser(tx, actor, id);
      const revoked = await tx.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await this.audit.record({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "user.sessions.revoked",
        entityType: "User",
        entityId: id,
        after: { email: user.email, sessionsRevoked: revoked.count }
      }, tx);
      return { ok: true, sessionsRevoked: revoked.count };
    });
  }

  async saveRole(actor: AuthenticatedUser, body: unknown) {
    assertCan(actor, Permissions.UserManage);
    const input = roleSchema.parse(body);
    if (input.code === "ADMIN" || input.code === "WORKER") throw new ConflictException("Les roles integres sont proteges. Creez un role personnalise.");
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.companyId + ':identity'},0))`;
      const permissions = await tx.permission.findMany({ where: { code: { in: [...new Set(input.permissions)] } } });
      if (permissions.length !== new Set(input.permissions).size) throw new BadRequestException("Permission inconnue.");
      const role = await tx.role.upsert({
        where: { companyId_code: { companyId: actor.companyId, code: input.code } },
        create: { companyId: actor.companyId, code: input.code, name: input.name },
        update: { name: input.name }
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({ data: permissions.map(p => ({ roleId: role.id, permissionId: p.id })) });
      await this.retainManager(tx, actor.companyId);
      await this.audit.record({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "role.permissions.changed",
        entityType: "Role",
        entityId: role.id,
        after: input
      }, tx);
      return role;
    });
  }
}
