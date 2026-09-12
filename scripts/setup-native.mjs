import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { nativeConfiguration } from "./lib/native-config.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const filename = resolve(root, ".env");
  if (!existsSync(filename)) throw new Error("Run pnpm setup:env once first. Your .env does not exist.");
  const original = readFileSync(filename, "utf8");
  const updated = nativeConfiguration(original, root);
  if (updated === original) { console.log("Native environment already configured; credentials unchanged."); }
  else {
    const backup = `${filename}.before-native-${Date.now()}`;
    writeFileSync(backup, original, { flag: "wx", mode: 0o600 });
    const temporary = `${filename}.native-${process.pid}.tmp`;
    writeFileSync(temporary, updated, { flag: "wx", mode: 0o600 });
    renameSync(temporary, filename);
    console.log("Configured local file storage, local email and separate test database. No passwords were regenerated.");
    console.log(`Private backup: ${backup}`);
  }
  console.log("Next: pnpm db:native (requires local PostgreSQL). This does not migrate existing Docker/S3 data.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
