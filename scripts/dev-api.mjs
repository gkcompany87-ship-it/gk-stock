import { spawn, spawnSync } from "node:child_process";
const build = spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"], { stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) process.exit(build.status ?? 1);
// tsc, not tsx/esbuild, emits the constructor metadata required by Nest DI.
const children = [
 spawn("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"], { stdio: "inherit", shell: process.platform === "win32" }),
 spawn(process.execPath, ["--watch", "dist/main.js"], { stdio: "inherit" })
];
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { children.forEach(child => child.kill(signal)); process.exit(0); });
