import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertLocalStorageAllowed, LocalObjectStore } from "./local-object-store.js";
export interface AssetInput { entityType: string; entityId: string; filename: string; mimeType: string; body: Buffer; snapshotHash?: string }
@Injectable()
export class FileStorageService {
  private readonly s3?: S3Client;
  private readonly local?: LocalObjectStore;
  private readonly bucket: string;
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    const driver = config.get<string>("STORAGE_DRIVER") ?? "s3";
    if (driver === "local") {
      assertLocalStorageAllowed(config.get<string>("NODE_ENV"));
      this.local = new LocalObjectStore(config.getOrThrow<string>("LOCAL_STORAGE_PATH"), this.bucket);
      return;
    }
    if (driver !== "s3") throw new Error("STORAGE_DRIVER must be s3 or local.");
    this.s3 = new S3Client({ region: config.getOrThrow<string>("S3_REGION"), endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      forcePathStyle: config.get("S3_FORCE_PATH_STYLE") === "true", maxAttempts: 2,
      credentials: { accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY_ID"), secretAccessKey: config.getOrThrow<string>("S3_SECRET_ACCESS_KEY") } });
  }
  async health() { if (this.local) return this.local.health(); await this.s3!.send(new HeadBucketCommand({ Bucket: this.bucket }), { abortSignal: AbortSignal.timeout(3000) }); }
  async read(storageKey: string, expectedChecksum?: string | null): Promise<Buffer> {
    let body: Buffer;
    if (this.local) body = await this.local.read(storageKey);
    else {
      const response = await this.s3!.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }), { abortSignal: AbortSignal.timeout(15_000) });
      if (!response.Body) throw new ServiceUnavailableException("Fichier indisponible.");
      body = Buffer.from(await response.Body.transformToByteArray());
    }
    if (expectedChecksum && createHash("sha256").update(body).digest("hex") !== expectedChecksum) throw new ServiceUnavailableException("Integrite du fichier non verifiee.");
    return body;
  }
  async save(companyId: string, input: AssetInput) {
    const existing = input.snapshotHash ? await this.prisma.fileAsset.findUnique({ where: { companyId_entityType_entityId_snapshotHash:
      { companyId, entityType: input.entityType, entityId: input.entityId, snapshotHash: input.snapshotHash } } }) : null;
    if (existing) return existing;
    const storageKey = `${companyId}/${input.entityType}/${input.entityId}/${input.snapshotHash ?? randomUUID()}`;
    let body = input.body;
    if (this.local) body = await this.local.putIfAbsent(storageKey, body);
    else try { await this.s3!.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: body, ContentType: input.mimeType, IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(15_000) }); }
    catch (error) {
      if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 412) throw error;
      // A concurrent renderer won the content-addressed key; retain its exact bytes and checksum.
      body = await this.read(storageKey);
    }
    const data = { companyId, entityType: input.entityType, entityId: input.entityId, snapshotHash: input.snapshotHash, storageKey,
      filename: input.filename, mimeType: input.mimeType, sizeBytes: body.byteLength, checksum: createHash("sha256").update(body).digest("hex") };
    try { return await this.prisma.fileAsset.create({ data }); }
    catch (error) {
      if (!input.snapshotHash || !(error instanceof Error) || !("code" in error) || error.code !== "P2002") throw error;
      return this.prisma.fileAsset.findUniqueOrThrow({ where: { companyId_entityType_entityId_snapshotHash:
        { companyId, entityType: input.entityType, entityId: input.entityId, snapshotHash: input.snapshotHash } } });
    }
  }
}
