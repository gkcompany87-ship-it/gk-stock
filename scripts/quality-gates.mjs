import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const phase = process.argv[2] ?? "final";
const commands = [["pnpm", ["lint"]], ["pnpm", ["typecheck"]], ["pnpm", ["test:unit"]]];
if (phase === "final") commands.push(["pnpm", ["db:validate"]], ["pnpm", ["test:integration"]], ["pnpm", ["build"]], ["pnpm", ["test:e2e"]]);
mkdirSync("docs/qa", { recursive: true });
const outcomes = commands.map(([command, args]) => {
 const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
 const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`;
 writeFileSync(`docs/qa/${phase}-${args[0].replaceAll(":", "-")}.log`, output);
 const status = result.error?.code === "ENOENT" ? "BLOCKED: executable unavailable" : result.status === 0 ? "PASS" : "FAIL";
 console.log(`${command} ${args.join(" ")}: ${status}`);
 return { command: `${command} ${args.join(" ")}`, status, exitCode: result.status };
});
writeFileSync(`docs/qa/${phase}.json`, JSON.stringify({ phase, node: process.version, outcomes }, null, 2));
process.exit(outcomes.every(o => o.status === "PASS") ? 0 : 1);
