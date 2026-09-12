import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
const root=process.cwd(),errors=[],warnings=[];
const file=resolve(root,".env.production");
if(!existsSync(file))errors.push(".env.production is missing.");
function parse(path){const out={};if(!existsSync(path))return out;for(const raw of readFileSync(path,"utf8").split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith("#"))continue;const i=line.indexOf("=");if(i<1)continue;let v=line.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);out[line.slice(0,i).trim()]=v;}return out;}
const cfg=parse(file);
if(existsSync(file)&&process.platform!=="win32"&&(statSync(file).mode&0o077)!==0)errors.push(".env.production must be chmod 600.");
if(!existsSync(resolve(root,"pnpm-lock.yaml")))errors.push("pnpm-lock.yaml is missing.");
for(const p of ["packages/database/prisma/demo-data.ts","apps/api/src/seed-demo.ts"])if(existsSync(resolve(root,p)))errors.push(`${p} must not exist in the production source tree.`);
for(const key of ["PUBLIC_APP_URL","API_ALLOWED_ORIGINS"]){if(/loca\.lt|trycloudflare\.com/i.test(cfg[key]??""))errors.push(`${key} contains a temporary development tunnel.`);}
if(cfg.PDF_DISABLE_SANDBOX==="true")errors.push("PDF_DISABLE_SANDBOX must remain false in production.");
if(cfg.SWAGGER_ENABLED!=="false")errors.push("SWAGGER_ENABLED must be false in production.");
if(cfg.NODE_ENV!=="production")errors.push("NODE_ENV must be production.");
if(/example|localhost|\.invalid$/i.test(cfg.SEED_ADMIN_EMAIL??""))errors.push("SEED_ADMIN_EMAIL must be a real reachable administrator address.");
if(!/^https:\/\//.test(cfg.PUBLIC_APP_URL??""))errors.push("PUBLIC_APP_URL must use HTTPS.");
if(!/^rediss:\/\//.test(cfg.REDIS_URL??""))warnings.push("Use rediss:// for managed/external production Redis.");
if(cfg.TRUST_PROXY_HOPS!=="1")warnings.push("TRUST_PROXY_HOPS is not 1. Verify it matches exactly one trusted reverse proxy before deployment.");
const sw=resolve(root,"apps/web/public/sw.js");if(!existsSync(sw))errors.push("Service worker is missing.");else if(/icon\.svg/.test(readFileSync(sw,"utf8"))&&!existsSync(resolve(root,"apps/web/public/icon.svg")))errors.push("Service worker references removed /icon.svg and would fail installation.");
const next=resolve(root,"apps/web/next.config.ts");if(existsSync(next)&&/\.loca\.lt|\.trycloudflare\.com/i.test(readFileSync(next,"utf8")))warnings.push("Temporary tunnel hostnames remain in allowedDevOrigins. Run pnpm dev:tunnel:cleanup when phone testing is complete.");
if(errors.length){console.error("Production security check FAILED:\n- "+errors.join("\n- "));if(warnings.length)console.warn("Warnings:\n- "+warnings.join("\n- "));process.exit(1);}console.log("Production security check passed.");if(warnings.length)console.warn("Warnings:\n- "+warnings.join("\n- "));
