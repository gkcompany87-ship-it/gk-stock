import { config } from "dotenv";
import { resolve } from "node:path";
import argon2 from "argon2";
import { createPrismaClient } from "../src/index.js";
import { Permissions, ROLE_PERMISSIONS, type RoleCode } from "@as-tino/shared";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
function required(name:string,minimum=1){const value=process.env[name]?.trim();if(!value||value.length<minimum)throw new Error(`${name} must contain at least ${minimum} characters.`);return value;}
const companyName=required("COMPANY_NAME",2);
const companySlug=required("COMPANY_SLUG",2);
const adminEmail=required("SEED_ADMIN_EMAIL",3).toLowerCase();
const adminName=process.env.SEED_ADMIN_NAME?.trim()||"Administrateur";
const adminPassword=required("SEED_ADMIN_PASSWORD",12);
if(/demo|example|as[- ]?tino/i.test(companySlug)||/demo|example/i.test(companyName))throw new Error("Refusing demo/example company identity. Configure the real client before bootstrap.");
if(/@(example\.|astino\.example$)|^admin@localhost$/i.test(adminEmail))throw new Error("Refusing a demo/example administrator email.");
const passwordHash=await argon2.hash(adminPassword,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
const prisma=createPrismaClient();
try{
  const result=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bootstrap:${companySlug}`},0))`;
    const existingCompany=await tx.company.findUnique({where:{slug:companySlug}});
    const company=existingCompany
      ? await tx.company.update({where:{id:existingCompany.id},data:{name:companyName,legalName:process.env.COMPANY_LEGAL_NAME?.trim()||companyName,locale:"fr-TN",currency:"TND",timezone:"Africa/Tunis"}})
      : await tx.company.create({data:{slug:companySlug,name:companyName,legalName:process.env.COMPANY_LEGAL_NAME?.trim()||companyName,locale:"fr-TN",currency:"TND",timezone:"Africa/Tunis"}});
    await tx.businessSettings.upsert({where:{companyId:company.id},update:{},create:{companyId:company.id}});
    for(const code of Object.values(Permissions))await tx.permission.upsert({where:{code},update:{},create:{code,description:code}});
    const permissions=await tx.permission.findMany();
    const roles:Record<string,string>={};
    for(const code of ["ADMIN","WORKER"] as RoleCode[]){
      const role=await tx.role.upsert({where:{companyId_code:{companyId:company.id,code}},update:{name:code==="ADMIN"?"Administrateur":"Magasinier"},create:{companyId:company.id,code,name:code==="ADMIN"?"Administrateur":"Magasinier"}});roles[code]=role.id;
      await tx.rolePermission.createMany({data:permissions.filter(p=>ROLE_PERMISSIONS[code].some(v=>v===p.code)).map(p=>({roleId:role.id,permissionId:p.id})),skipDuplicates:true});
    }
    let admin=await tx.user.findUnique({where:{companyId_email:{companyId:company.id,email:adminEmail}}});
    if(!admin){admin=await tx.user.create({data:{companyId:company.id,email:adminEmail,name:adminName,passwordHash,roles:{create:{roleId:roles.ADMIN!}}}});await tx.auditLog.create({data:{companyId:company.id,actorId:admin.id,action:"user.created",entityType:"User",entityId:admin.id,after:{email:adminEmail,role:"ADMIN",source:"bootstrap"}}});}
    else if(!await tx.userRole.findUnique({where:{userId_roleId:{userId:admin.id,roleId:roles.ADMIN!}}}))await tx.userRole.create({data:{userId:admin.id,roleId:roles.ADMIN!}});
    await tx.warehouse.upsert({where:{companyId_code:{companyId:company.id,code:"MAIN"}},update:{name:"Dépôt principal",active:true},create:{companyId:company.id,code:"MAIN",name:"Dépôt principal"}});
    return{company:company.name,slug:company.slug,admin:admin.email};
  },{timeout:60_000,maxWait:10_000});
  console.log(JSON.stringify(result));
  console.log("Bootstrap completed. No demo products, customers, documents, payments, worker users or stock movements were created.");
}finally{await prisma.$disconnect();}
