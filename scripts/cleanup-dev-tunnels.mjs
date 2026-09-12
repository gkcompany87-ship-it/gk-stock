import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
mkdirSync(".local",{recursive:true});
const stamp=Date.now();
function backup(file){if(existsSync(file))copyFileSync(file,join(".local",`${file.replaceAll("/","-")}.before-tunnel-cleanup-${stamp}`));}
if(existsSync(".env")){
  backup(".env");
  let s=readFileSync(".env","utf8");
  s=s.replace(/^API_ALLOWED_ORIGINS=(.*)$/m,(_,raw)=>{
    const quote=/^["']/.test(raw.trim())?raw.trim()[0]:"";
    const val=raw.trim().replace(/^["']|["']$/g,"");
    const keep=val.split(",").map(v=>v.trim()).filter(Boolean).filter(v=>!/(\.loca\.lt|\.trycloudflare\.com)(?::\d+)?$/i.test(new URL(v).host));
    return `API_ALLOWED_ORIGINS=${quote}${keep.join(",")}${quote}`;
  });
  writeFileSync(".env",s);
}
const next="apps/web/next.config.ts";
if(existsSync(next)){
  backup(next);let s=readFileSync(next,"utf8");
  s=s.replace(/\s*allowedDevOrigins:\s*\[([^\]]*)\],?\n?/m,(_,body)=>{
    const keep=[...body.matchAll(/["']([^"']+)["']/g)].map(m=>m[1]).filter(h=>!/(\.loca\.lt|\.trycloudflare\.com)$/i.test(h));
    return keep.length?`\n  allowedDevOrigins: [${keep.map(h=>JSON.stringify(h)).join(", ")}],\n`:"\n";
  });
  writeFileSync(next,s);
}
console.log("Temporary LocalTunnel/Cloudflare development origins removed. Restart pnpm dev if it is running.");
