import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import argon2 from "argon2";
import { createPrismaClient } from "../packages/database/dist/index.js";
if (existsSync(".env")) process.loadEnvFile(".env");
const email=(process.argv.find(v=>v.startsWith("--email="))?.slice(8) || process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
if(!email)throw new Error("Provide --email=... or configure SEED_ADMIN_EMAIL.");
const password=randomBytes(36).toString("base64url");
const passwordHash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
const db=createPrismaClient();
try{
  const company=await db.company.findUniqueOrThrow({where:{slug:process.env.COMPANY_SLUG}});
  const user=await db.user.findUniqueOrThrow({where:{companyId_email:{companyId:company.id,email}}});
  await db.$transaction(async tx=>{
    await tx.user.update({where:{id:user.id},data:{passwordHash,failedLoginCount:0,lockoutUntil:null}});
    await tx.refreshSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
    await tx.auditLog.create({data:{companyId:company.id,actorId:user.id,action:"auth.password.rotated.admin-cli",entityType:"User",entityId:user.id}});
  });
  mkdirSync(".local",{recursive:true,mode:0o700});
  const file=resolve(".local",`rotated-admin-credentials-${Date.now()}.txt`);
  writeFileSync(file,`Email: ${email}\nPassword: ${password}\n`,{mode:0o600});chmodSync(file,0o600);
  console.log(`Admin password rotated. New credential written privately to:\n${file}\nThe password was intentionally not printed.`);
}catch(error){throw error;}finally{await db.$disconnect();}
