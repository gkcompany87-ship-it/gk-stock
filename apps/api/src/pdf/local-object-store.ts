import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

/** This adapter is deliberately forbidden in production. The API still owns authorization. */
export function assertLocalStorageAllowed(environment: string | undefined): void {
  if (environment !== "development" && environment !== "test") {
    throw new Error("Local file storage is allowed only in development or test; use S3 in production.");
  }
}

/** Private local development storage. Keys are hashed, never interpreted as paths. */
export class LocalObjectStore {
  private readonly directory: string;
  constructor(root: string, bucket: string) {
    if (!root || !isAbsolute(root)) throw new Error("LOCAL_STORAGE_PATH must be an absolute path.");
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid local storage bucket.");
    this.directory = join(root, bucket);
  }
  private filename(key: string): string {
    if (!key || key.length > 2048 || key.includes("\0")) throw new Error("Invalid storage key.");
    return join(this.directory, createHash("sha256").update(key).digest("hex"));
  }
  async health(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Storage directory must not be a symlink.");
    await access(this.directory, constants.R_OK | constants.W_OK);
  }
  async read(key: string): Promise<Buffer> {
    await this.health();
    const file = await open(this.filename(key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile()) throw new Error("Invalid storage object.");
      return await file.readFile();
    } finally { await file.close(); }
  }
  async putIfAbsent(key: string, body: Buffer): Promise<Buffer> {
    const target = this.filename(key);
    await this.health();
    const temporary = join(this.directory, `.pending-${randomUUID()}`);
    const file = await open(temporary, "wx", 0o600);
    try {
      // Write and flush fully before publishing. A competing reader never sees partial bytes.
      try { await file.writeFile(body); await file.sync(); }
      finally { await file.close(); }
      try {
        await link(temporary, target); // Atomic no-overwrite publication on the same filesystem.
        return body;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
        return await this.read(key);
      }
    } finally { await unlink(temporary); }
  }
}
