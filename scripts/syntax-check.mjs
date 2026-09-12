import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let ts;
try { ts = require("typescript"); }
catch { ts = require(path.join(spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim(), "typescript")); }
const files=[];
function scan(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { if (["node_modules",".next","dist",".git",".local"].includes(entry.name)) continue; const file=path.join(dir,entry.name); if(entry.isDirectory())scan(file);else if(/\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts"))files.push(file); } }
scan("apps"); scan("packages"); scan("tests");
let errors=0;
for(const file of files){const result=ts.transpileModule(fs.readFileSync(file,"utf8"),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,jsx:ts.JsxEmit.ReactJSX,experimentalDecorators:true,emitDecoratorMetadata:true}});
 for(const d of result.diagnostics??[]){ if(d.category===ts.DiagnosticCategory.Error){errors++;console.error(file,ts.flattenDiagnosticMessageText(d.messageText,"\n"));} }
}
console.log(`Syntax-only check: ${files.length} TypeScript files; ${errors} syntax errors. This is NOT dependency-aware type checking.`);
process.exitCode=errors?1:0;
