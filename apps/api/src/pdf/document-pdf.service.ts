import { ConflictException, Injectable } from "@nestjs/common";
import type { DocumentType } from "@prisma/client";
import { Permissions } from "@as-tino/shared";
import { assertCan } from "../common/access.js";
import type { AuthenticatedUser } from "../common/current-user.js";
import { canonical, digest } from "../common/json.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { DocumentsService } from "../documents/documents.service.js";
import type { DocumentSnapshot } from "../documents/document-types.js";
import { PdfService } from "./pdf.service.js";
import { FileStorageService } from "./file-storage.service.js";
@Injectable()
export class DocumentPdfService {
  private readonly draftCache = new Map<
    string,
    { buffer: Buffer; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly renderer: PdfService,
    private readonly storage: FileStorageService
  ) {}

  private cleanupDraftCache() {
    const now = Date.now();

    for (const [key, value] of this.draftCache) {
      if (value.expiresAt <= now) {
        this.draftCache.delete(key);
      }
    }

    while (this.draftCache.size > 25) {
      const oldest = this.draftCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.draftCache.delete(oldest);
    }
  }
  async forActor(actor: AuthenticatedUser, type: DocumentType, id: string, original = false) {
    assertCan(actor, Permissions.DocumentManage); assertCan(actor, Permissions.FinancialRead);
    return this.render(actor.companyId, type, id, original);
  }
  async forQueuedJob(companyId: string, type: DocumentType, id: string) {
    const doc = await this.documents.load(this.prisma, type, companyId, id);
    if (["DRAFT","CANCELLED"].includes(doc.status)) throw new ConflictException("Document non envoyable.");
    return this.render(companyId, type, id, true);
  }
  private async logo(companyId: string, id: string | null): Promise<string | undefined> {
    if (!id) return undefined;
    const image = await this.prisma.fileAsset.findFirst({ where: { id, companyId, entityType: "IMAGE" } });
    if (!image) throw new ConflictException("Logo archive introuvable.");
    return `data:${image.mimeType};base64,${(await this.storage.read(image.storageKey, image.checksum)).toString("base64")}`;
  }
  private async render(companyId: string, type: DocumentType, id: string, original: boolean) {
    const doc = await this.documents.load(this.prisma, type, companyId, id);
    const draft = !doc.snapshot;
    if (draft) {
      const snapshot = await this.documents.snapshot(
        this.prisma,
        type,
        doc,
        doc.internalRef,
        doc.issueDate ?? new Date()
      );

      const snapshotHash = digest(canonical(snapshot));
      const cacheKey = `${companyId}:${type}:${id}:${snapshotHash}`;

      this.cleanupDraftCache();

      const cached = this.draftCache.get(cacheKey);

      if (cached && cached.expiresAt > Date.now()) {
        return {
          buffer: cached.buffer,
          filename: `BROUILLON-${id}.pdf`
        };
      }

      const logoDataUri = await this.logo(
        companyId,
        snapshot.company.logoAssetId
      );

      const buffer = await this.renderer.render(snapshot, {
        logoDataUri,
        watermark: "BROUILLON - NON EMIS"
      });

      this.draftCache.set(cacheKey, {
        buffer,
        expiresAt: Date.now() + 5 * 60_000
      });

      return {
        buffer,
        filename: `BROUILLON-${id}.pdf`
      };
    }
    const snapshot = doc.snapshot as unknown as DocumentSnapshot;
    if (!doc.snapshotHash || digest(canonical(snapshot)) !== doc.snapshotHash) throw new ConflictException("Integrite de l'instantane non verifiee.");
    let asset = await this.prisma.fileAsset.findUnique({ where: { companyId_entityType_entityId_snapshotHash: { companyId, entityType: type, entityId: id, snapshotHash: doc.snapshotHash } } });
    const logoDataUri = !asset || doc.status === "CANCELLED" && !original ? await this.logo(companyId, snapshot.company.logoAssetId) : undefined;
    if (!asset) {
      const body = await this.renderer.render(snapshot, { logoDataUri });
      asset = await this.storage.save(companyId, { entityType: type, entityId: id, snapshotHash: doc.snapshotHash, filename: `${doc.number}.pdf`, mimeType: "application/pdf", body });
    }
    if (doc.status === "CANCELLED" && !original) return { buffer: await this.renderer.render(snapshot, { logoDataUri, watermark: "ANNULE", cancellationReason: doc.cancellationReason ?? "Document annule" }), filename: `ANNULE-${doc.number}.pdf` };
    return { buffer: await this.storage.read(asset.storageKey, asset.checksum), filename: asset.filename };
  }
}
