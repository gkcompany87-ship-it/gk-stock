import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, readdir, writeFile, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { LocalObjectStore, assertLocalStorageAllowed } from "../apps/api/src/pdf/local-object-store.ts";
import { nativeConfiguration, replaceEnv, localDatabase, validateTestStorage } from "./lib/native-config.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "as-tino-native-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const example = [
  "NODE_ENV=development", "POSTGRES_USER=as_tino", "POSTGRES_PASSWORD=dummy-test-password", "POSTGRES_DB=as_tino_stock",
  "DATABASE_URL=postgresql://as_tino:dummy-test-password@localhost:5432/as_tino_stock?schema=public",
  "TEST_DATABASE_URL=postgresql://as_tino:dummy-test-password@localhost:5433/as_tino_stock_test?schema=public",
  "SEED_ADMIN_PASSWORD=unchanged-admin-test-value", "SEED_WORKER_PASSWORD=unchanged-worker-test-value",
  "COOKIE_SECRET=unchanged-cookie-test-value", "ACCESS_TOKEN_SECRET=unchanged-token-test-value", "S3_SECRET_ACCESS_KEY=unchanged-s3-test-value"
].join("\n") + "\n";

test("native configuration preserves all generated secrets", () => {
  const after = parseEnv(nativeConfiguration(example, "/tmp/as tino stock"));
  const before = parseEnv(example);
  for (const key of ["POSTGRES_PASSWORD", "DATABASE_URL", "SEED_ADMIN_PASSWORD", "SEED_WORKER_PASSWORD", "COOKIE_SECRET", "ACCESS_TOKEN_SECRET", "S3_SECRET_ACCESS_KEY"]) assert.equal(after[key], before[key]);
  assert.equal(after.STORAGE_DRIVER, "local");
  assert.equal(after.LOCAL_STORAGE_PATH, "/tmp/as tino stock/.local/uploads");
});

test("native configuration is idempotent", () => {
  const first = nativeConfiguration(example, "/tmp/as-tino");
  assert.equal(nativeConfiguration(first, "/tmp/as-tino"), first);
});

test("test database is separate and uses the native PostgreSQL port", () => {
  const after = parseEnv(nativeConfiguration(example, "/tmp/as-tino"));
  assert.equal(new URL(after.TEST_DATABASE_URL).port, "5432");
  assert.equal(new URL(after.TEST_DATABASE_URL).pathname, "/as_tino_stock_test");
  assert.notEqual(after.LOCAL_STORAGE_PATH, after.TEST_LOCAL_STORAGE_PATH);
});

test("setup refuses production and remote database URLs", () => {
  assert.throws(() => nativeConfiguration(example.replace("NODE_ENV=development", "NODE_ENV=production"), "/tmp/project"));
  assert.throws(() => nativeConfiguration(example.replaceAll("@localhost:", "@database.example:"), "/tmp/project"));
  assert.throws(() => localDatabase("https://localhost/db"));
});

test("setup refuses credential mismatch instead of resetting passwords", () => {
  assert.throws(() => nativeConfiguration(example.replace("POSTGRES_PASSWORD=dummy-test-password", "POSTGRES_PASSWORD=different"), "/tmp/project"));
});

test("setup refuses shared test database", () => {
  assert.throws(() => nativeConfiguration(example.replace("/as_tino_stock_test?", "/as_tino_stock?"), "/tmp/project"));
});

test("environment replacement does not interpret dollar replacement tokens", () => {
  assert.equal(parseEnv(replaceEnv("VALUE=old\n", { VALUE: "$&-safe" })).VALUE, "$&-safe");
  assert.throws(() => replaceEnv("VALUE=old\n", { VALUE: "a\nb" }));
});

test("native test storage requires an isolated absolute directory", () => {
  assert.throws(() => validateTestStorage({ STORAGE_DRIVER: "local", LOCAL_STORAGE_PATH: "/tmp/a", TEST_LOCAL_STORAGE_PATH: "/tmp/a" }));
  assert.throws(() => validateTestStorage({ STORAGE_DRIVER: "local", TEST_LOCAL_STORAGE_PATH: "relative" }));
  assert.equal(validateTestStorage({ STORAGE_DRIVER: "s3" }), undefined);
});

test("local storage is forbidden in production or unspecified environments", () => {
  assertLocalStorageAllowed("development"); assertLocalStorageAllowed("test");
  for (const env of [undefined, "production", "staging", ""]) assert.throws(() => assertLocalStorageAllowed(env));
});

test("local objects round-trip and private file permissions are used", async (t) => {
  const root = await fixture(t); const store = new LocalObjectStore(root, "as-tino-stock");
  const body = Buffer.from("example test bytes");
  assert.deepEqual(await store.putIfAbsent("company/INVOICE/document/snapshot", body), body);
  assert.deepEqual(await store.read("company/INVOICE/document/snapshot"), body);
  const files = await readdir(join(root, "as-tino-stock")); assert.equal(files.length, 1);
  assert.equal((await stat(join(root, "as-tino-stock", files[0]))).mode & 0o777, 0o600);
});

test("the first object is immutable across repeated writes", async (t) => {
  const root = await fixture(t); const store = new LocalObjectStore(root, "as-tino-stock");
  await store.putIfAbsent("same-key", Buffer.from("original"));
  assert.equal((await store.putIfAbsent("same-key", Buffer.from("replacement"))).toString(), "original");
  assert.equal((await store.read("same-key")).toString(), "original");
});

test("concurrent writes publish one complete winner and remove temporary files", async (t) => {
  const root = await fixture(t); const store = new LocalObjectStore(root, "as-tino-stock");
  const responses = await Promise.all(Array.from({ length: 16 }, (_, i) => store.putIfAbsent("race", Buffer.alloc(256 * 1024, i))));
  const winner = await store.read("race"); assert.equal(winner.length, 256 * 1024);
  assert.ok(winner.equals(Buffer.alloc(winner.length, winner[0])));
  for (const response of responses) assert.deepEqual(response, winner);
  assert.equal((await readdir(join(root, "as-tino-stock"))).length, 1);
});

test("storage keys cannot escape the private directory", async (t) => {
  const root = await fixture(t); const store = new LocalObjectStore(root, "as-tino-stock");
  await store.putIfAbsent("../../outside", Buffer.from("contained"));
  assert.deepEqual(await readdir(root), ["as-tino-stock"]);
  assert.equal((await store.read("../../outside")).toString(), "contained");
  assert.throws(() => new LocalObjectStore(root, "../outside"));
  assert.throws(() => new LocalObjectStore("relative", "bucket"));
});

test("storage rejects symbolic-link objects", async (t) => {
  const root = await fixture(t); const store = new LocalObjectStore(root, "as-tino-stock"); await store.health();
  const outside = join(root, "outside"); await writeFile(outside, "do not read");
  const target = join(root, "as-tino-stock", createHash("sha256").update("key").digest("hex"));
  await symlink(outside, target);
  await assert.rejects(() => store.read("key"));
});

test("storage rejects symbolic-link bucket directories", async (t) => {
  const root = await fixture(t); const other = join(root, "other"); await mkdir(other);
  await symlink(other, join(root, "as-tino-stock"));
  await assert.rejects(() => new LocalObjectStore(root, "as-tino-stock").health());
});

test("unknown objects are not silently created", async (t) => {
  const root = await fixture(t); const store = new LocalObjectStore(root, "as-tino-stock");
  await assert.rejects(() => store.read("missing"), { code: "ENOENT" });
  assert.deepEqual(await readdir(join(root, "as-tino-stock")), []);
});
