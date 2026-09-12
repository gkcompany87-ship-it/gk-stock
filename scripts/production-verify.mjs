import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
if(existsSync(".env"))process.loadEnvFile(".env");
const commands=[
  ["pnpm",["production:check"]],
  ["pnpm",["production:security-check"]],
  ["pnpm",["release:check"]]
];
if(!process.env.TEST_DATABASE_URL){console.error("Production verification requires TEST_DATABASE_URL pointing to an isolated database ending in _test. It will never run integration/E2E tests against the development or production database.");process.exit(1);}
commands.push(["pnpm",["test:integration"]],["pnpm",["test:e2e:prepare"]],["pnpm",["test:e2e"]],["pnpm",["test:pdf"]]);
for(const [cmd,args] of commands){console.log(`\n=== ${cmd} ${args.join(" ")} ===`);const r=spawnSync(cmd,args,{stdio:"inherit",shell:false});if(r.status!==0)process.exit(r.status??1);}
console.log("\nAll automated production verification gates passed. External DNS/TLS, SMTP delivery, object-storage policy, backup restore and accountant approval still require live-environment acceptance.");
