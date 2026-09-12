import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../.local/", import.meta.url));
mkdirSync(root, { recursive: true, mode: 0o700 });
// Do not inherit Mailpit relay/forward settings from a user's unrelated project.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("MP_")));
const child = spawn("mailpit", ["--listen", "127.0.0.1:8025", "--smtp", "127.0.0.1:1025", "--database", `${root}mailpit.sqlite`], { stdio: "inherit", env });
child.on("error", () => { console.error("Mailpit did not start. Install it with: brew install mailpit"); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = signal ? 0 : (code ?? 1); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
