import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const native = process.argv.includes("--native") || env.STORAGE_DRIVER === "local";
const available = (command, args) => spawnSync(command, args, { timeout: 10_000 }).status === 0;
const checks = [
  ["Node 24+", Number(process.versions.node.split(".")[0]) >= 24],
  ["pnpm", available("pnpm", ["--version"])],
  [".env", existsSync(".env")], ["pnpm-lock.yaml", existsSync("pnpm-lock.yaml")]
];
if (native) {
  checks.push(["psql (add Homebrew PostgreSQL bin to PATH)", available("psql", ["--version"])],
    ["redis-cli", available("redis-cli", ["--version"])], ["mailpit", available("mailpit", ["--version"])],
    ["local storage configured", env.STORAGE_DRIVER === "local" && !!env.LOCAL_STORAGE_PATH]);
  console.log("Native development mode: Docker and MinIO are not required.");
} else checks.push(["Docker Compose", available("docker", ["compose", "version"])]);
for (const [label, ok] of checks) console.log(`${ok ? "OK" : "MISSING"} ${label}`);
console.log("These are prerequisite checks, not application/database acceptance tests.");
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
