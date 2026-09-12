import { spawnSync } from "node:child_process";
import { testEnvironment } from "./test-environment.mjs";
const env = testEnvironment();
const commands = [
  ["pnpm", ["db:deploy"]],
  ["pnpm", ["db:seed"]],
  ["pnpm", ["--filter", "@as-tino/database", "exec", "tsx", "prisma/e2e-fixtures.ts"]],
  ["pnpm", ["exec", "turbo", "build", "--filter=@as-tino/api...", "--filter=@as-tino/web..."]]
];
for (const [cmd,args] of commands) {
  const result = spawnSync(cmd, args, { env, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
