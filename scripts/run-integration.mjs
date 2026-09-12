import { spawnSync } from "node:child_process";
import { testEnvironment } from "./test-environment.mjs";
const env = testEnvironment();
for (const args of [["db:deploy"], ["exec", "turbo", "build", "--filter=@as-tino/api..."], ["--filter", "@as-tino/api", "test:integration"]]) {
 const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
 if (result.status !== 0) process.exit(result.status || 1);
}
