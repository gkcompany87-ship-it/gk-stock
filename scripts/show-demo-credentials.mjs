import { readFileSync } from "node:fs";
const text = readFileSync(".env", "utf8");
for (const key of ["SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD", "SEED_WORKER_EMAIL", "SEED_WORKER_PASSWORD"])
 console.log(text.split(/\r?\n/).find(line => line.startsWith(`${key}=`)) ?? `${key}=not configured`);
