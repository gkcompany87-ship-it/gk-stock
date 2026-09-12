import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Req, Res } from "@nestjs/common";
import { Permissions } from "@as-tino/shared";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser, type AuthenticatedUser } from "../common/current-user.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { assertCan } from "../common/access.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { FileStorageService } from "./file-storage.service.js";
@Controller({ path: "files", version: "1" })
export class FilesController {
  constructor(private readonly prisma: PrismaService, private readonly storage: FileStorageService, private readonly audit: AuditService) {}
  @Post("images") @RequirePermissions(Permissions.ProductWrite)
  async upload(@CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    assertCan(actor, Permissions.ProductWrite); const file = await req.file();
    if (!file) throw new BadRequestException("Selectionnez une image.");
    const bytes = await file.toBuffer();
    if (file.file.truncated) throw new BadRequestException("Image limitee a 2 Mo.");
    let output: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false }); const meta = await image.metadata();
      if (!["png","jpeg","webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("unsupported image");
      output = await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { throw new BadRequestException("Image invalide. Utilisez un fichier PNG, JPEG ou WebP non anime."); }
    if (output.length > 2 * 1024 * 1024) throw new BadRequestException("Image trop volumineuse.");
    const asset = await this.storage.save(actor.companyId, { entityType: "IMAGE", entityId: randomUUID(), filename: "image.webp", mimeType: "image/webp", body: output });
    await this.audit.record({ companyId: actor.companyId, actorId: actor.id, action: "file.image.uploaded", entityType: "FileAsset", entityId: asset.id, after: { sizeBytes: asset.sizeBytes } });
    return { id: asset.id, url: `/api/v1/files/${asset.id}`, mimeType: asset.mimeType };
  }
  @Get(":id") @RequirePermissions(Permissions.ProductRead)
  async get(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Res() reply: FastifyReply) {
    assertCan(actor, Permissions.ProductRead);
    const asset = await this.prisma.fileAsset.findFirst({ where: { id, companyId: actor.companyId, entityType: "IMAGE" } });
    if (!asset || !["image/png","image/jpeg","image/webp"].includes(asset.mimeType)) throw new NotFoundException("Image introuvable.");
    const buffer = await this.storage.read(asset.storageKey, asset.checksum);
    return reply.header("Content-Type", asset.mimeType).header("X-Content-Type-Options", "nosniff").header("Content-Disposition", 'inline; filename="image.webp"').send(buffer);
  }
}
