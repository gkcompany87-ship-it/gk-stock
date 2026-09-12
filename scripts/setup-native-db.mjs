import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { localDatabase, nativeConfiguration } from "./lib/native-config.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const text = readFileSync(resolve(root, ".env"), "utf8");
  const env = parseEnv(text);
  nativeConfiguration(text, root); // Refuses remote, production and inconsistent credentials.
  if (env.STORAGE_DRIVER !== "local") throw new Error("Run pnpm setup:native first.");
  const development = localDatabase(env.DATABASE_URL);
  const testing = localDatabase(env.TEST_DATABASE_URL);
  if ((development.url.port || "5432") !== (testing.url.port || "5432")) throw new Error("Native dev and test databases must use the same PostgreSQL server.");
  let psql = "psql";
  if (spawnSync(psql, ["--version"]).status !== 0) {
    const brew = spawnSync("brew", ["--prefix", "postgresql@18"], { encoding: "utf8" });
    const candidate = brew.status === 0 ? resolve(brew.stdout.trim(), "bin", "psql") : "";
    if (!candidate || !existsSync(candidate)) throw new Error("Install PostgreSQL first: brew install postgresql@18");
    psql = candidate;
  }
  const admin = process.env.NATIVE_PG_ADMIN || userInfo().username;
  const port = development.url.port || "5432";
  const args = ["-X", "-q", "-t", "-A", "-w", "-h", "127.0.0.1", "-p", port, "-v", "ON_ERROR_STOP=1"];
  const safeError = (message) => String(message || "PostgreSQL command failed.").replaceAll(development.password, "[REDACTED]").slice(0, 1800);
  const run = (sql, user = admin, database = "postgres", password = process.env.NATIVE_PG_ADMIN_PASSWORD || "") => {
    const result = spawnSync(psql, [...args, "-U", user, "-d", database,
      "-v", `app_role=${development.user}`, "-v", `app_db=${development.name}`, "-v", `test_db=${testing.name}`], {
      input: sql, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, PGCONNECT_TIMEOUT: "5", PGPASSWORD: password, ASTINO_DATABASE_PASSWORD: development.password }
    });
    if (result.status !== 0) throw new Error(safeError(result.stderr || result.error?.message));
    return result.stdout.trim();
  };
  const version = Number(run("SHOW server_version_num;\n"));
  if (version < 160000 || version >= 190000) throw new Error("Use PostgreSQL 16, 17 or 18 for local development.");
  const wrongOwner = run("SELECT datname FROM pg_database WHERE datname IN (:'app_db', :'test_db') AND pg_get_userbyid(datdba) <> :'app_role';\n");
  if (wrongOwner) throw new Error("An existing database has a different owner. Refusing to modify it; choose separate database names.");
  const roleExists = run("SELECT 1 FROM pg_roles WHERE rolname = :'app_role';\n") === "1";
  if (roleExists) {
    // Do not reset an existing role password or touch another application's role.
    run("SELECT 1;\n", development.user, "postgres", development.password);
  }
  run(String.raw`\getenv app_password ASTINO_DATABASE_PASSWORD
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'app_role', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'test_db', :'app_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_db')
\gexec
`);
  for (const db of [development, testing]) run("SELECT 1;\n", db.user, db.name, db.password);
  console.log(`Local PostgreSQL connection checked. Databases ready: ${development.name}, ${testing.name}.`);
  console.log("Existing databases were not erased; existing role passwords were not changed.");
  console.log("Next: pnpm db:validate && pnpm db:generate && pnpm db:deploy");
} catch (error) {
  console.error(error.message);
  console.error("Check that PostgreSQL is running. Homebrew normally uses your macOS username as its local administrator.");
  console.error("For a custom installation, set NATIVE_PG_ADMIN (and NATIVE_PG_ADMIN_PASSWORD privately, if required). No database is dropped by this script.");
  process.exitCode = 1;
}
