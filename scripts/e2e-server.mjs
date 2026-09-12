import { spawn } from "node:child_process";
import { testEnvironment } from "./test-environment.mjs";
const api = process.argv[2] === "api";
const base = testEnvironment();
const env = {
  ...base,
  API_PORT: "4100",
  API_ALLOWED_ORIGINS: "http://127.0.0.1:3100",
  PUBLIC_APP_URL: "http://127.0.0.1:3100",
  API_INTERNAL_URL: "http://127.0.0.1:4100",
  NODE_ENV: api ? "test" : "production"
};
const child = spawn(
  api ? "node" : "pnpm",
  api ? ["apps/api/dist/main.js"] : ["--filter", "@as-tino/web", "exec", "next", "start", "--port", "3100", "--hostname", "127.0.0.1"],
  { env, stdio: "inherit" }
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));
child.on("error", error => { console.error(error.message); process.exit(1); });
