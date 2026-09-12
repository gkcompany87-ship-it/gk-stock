import { spawnSync } from "node:child_process";
const commands=[["pnpm",["db:validate"]],["pnpm",["lint"]],["pnpm",["typecheck"]],["pnpm",["test:unit"]],["pnpm",["build"]]];
for(const [cmd,args] of commands){console.log(`\n=== ${cmd} ${args.join(" ")} ===`);const r=spawnSync(cmd,args,{stdio:"inherit",shell:false});if(r.status!==0)process.exit(r.status??1);}console.log("\nCore release gates passed.");
