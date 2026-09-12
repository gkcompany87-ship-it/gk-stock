import { parseEnv } from "node:util";
import { isAbsolute, resolve } from "node:path";

export function replaceEnv(text, updates) {
  let output = text;
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n"\\]/.test(String(value))) {
      throw new Error("Unsupported environment key or value; no file was changed.");
    }
    const line = `${key}="${value}"`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    output = pattern.test(output) ? output.replace(pattern, () => line) : `${output.trimEnd()}\n${line}\n`;
  }
  return output;
}

export function localDatabase(value) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Native setup only accepts a localhost PostgreSQL database; refusing a remote URL.");
  }
  const name = decodeURIComponent(url.pathname.slice(1));
  const user = decodeURIComponent(url.username);
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name) || !/^[a-z][a-z0-9_]{0,62}$/.test(user)) {
    throw new Error("Native setup requires simple lowercase database and role names.");
  }
  return { url, name, user, password: decodeURIComponent(url.password) };
}

export function nativeConfiguration(text, root) {
  const env = parseEnv(text);
  if (env.NODE_ENV !== "development") throw new Error("Native setup is development-only. Refusing to change this environment.");
  const database = localDatabase(env.DATABASE_URL);
  if (!database.password || !env.POSTGRES_PASSWORD || database.password !== env.POSTGRES_PASSWORD || database.user !== env.POSTGRES_USER || database.name !== env.POSTGRES_DB) {
    throw new Error("DATABASE_URL and POSTGRES_* must match. Secrets will not be reset automatically.");
  }
  if (database.name.endsWith("_test")) throw new Error("The development database must not be the test database.");
  const test = localDatabase(env.TEST_DATABASE_URL);
  if (!test.name.endsWith("_test") || test.name === database.name || test.user !== database.user || test.password !== database.password) {
    throw new Error("TEST_DATABASE_URL must use the same local role and a separate database ending in _test.");
  }
  test.url.hostname = database.url.hostname;
  test.url.port = database.url.port || "5432";
  const rootPath = resolve(root, ".local", "uploads");
  return replaceEnv(text, {
    STORAGE_DRIVER: "local", LOCAL_STORAGE_PATH: rootPath,
    TEST_LOCAL_STORAGE_PATH: resolve(root, ".local", "uploads-test"),
    TEST_DATABASE_URL: test.url.toString(),
    API_HOST: "127.0.0.1", REDIS_URL: "redis://127.0.0.1:6379/0", TEST_REDIS_URL: "redis://127.0.0.1:6379/1",
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_SECURE: "false", SMTP_REQUIRE_TLS: "false", SMTP_USER: "", SMTP_PASSWORD: ""
  });
}

export function validateTestStorage(env) {
  if (env.STORAGE_DRIVER !== "local") return undefined;
  if (!env.TEST_LOCAL_STORAGE_PATH || !isAbsolute(env.TEST_LOCAL_STORAGE_PATH) || resolve(env.TEST_LOCAL_STORAGE_PATH) === resolve(env.LOCAL_STORAGE_PATH || ".")) {
    throw new Error("Native tests require a separate absolute TEST_LOCAL_STORAGE_PATH.");
  }
  return env.TEST_LOCAL_STORAGE_PATH;
}
