import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { randomBytes,randomUUID,createHash } from "node:crypto";
import argon2 from "argon2";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import type { PrismaService } from "../../src/prisma/prisma.service.js";
import { Permissions,ROLE_PERMISSIONS } from "@as-tino/shared";

const database=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!database||!new URL(database).pathname.endsWith("_test"))throw new Error("Integration tests require a dedicated PostgreSQL database ending in _test. No production or development database is accepted.");
process.env.DATABASE_URL=database;
process.env.NODE_ENV="test";
process.env.COMPANY_SLUG=`integration-${randomUUID()}`;
process.env.ACCESS_TOKEN_SECRET=randomBytes(32).toString("base64url");
process.env.COOKIE_SECRET=randomBytes(32).toString("base64url");
process.env.API_ALLOWED_ORIGINS="http://localhost:3000";
process.env.TRUST_PROXY_HOPS="0";
process.env.REDIS_URL=process.env.TEST_REDIS_URL??process.env.REDIS_URL??"redis://127.0.0.1:6379/1";
process.env.S3_BUCKET=process.env.TEST_S3_BUCKET??process.env.S3_BUCKET??"as-tino-test";
process.env.SWAGGER_ENABLED="true";
const password=randomBytes(30).toString("base64url");
const adminEmail=`admin-${randomUUID()}@example.test`;
const workerEmail=`worker-${randomUUID()}@example.test`;
let app:NestFastifyApplication;let server:FastifyInstance;let db:PrismaService;
let companyId:string;let warehouseId:string;let adminId:string;let workerId:string;let customerId:string;
let ipSequence=1;
interface Identified {id:string;[key:string]:unknown}
interface DocumentResult extends Identified {number:string|null;status:string;total:string;paidAmount:string;remainingAmount:string;snapshot:Record<string,unknown>}
interface ProductResult extends Identified {sku:string;barcode:string;quantity:string;purchasePrice?:string;sellingPrice?:string;lowStock:boolean}
interface MovementResult extends Identified {quantity:string;quantityBefore:string;quantityAfter:string;product:ProductResult;userId:string}
type TestHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
class Session {
 cookies=new Map<string,string>();readonly ip=`198.51.100.${ipSequence++}`;
 async raw(method:TestHttpMethod,path:string,payload?:unknown,headers:Record<string,string>={}){
  const response=await server.inject({method,url:`/api/v1${path}`,remoteAddress:this.ip,
   headers:{origin:"http://localhost:3000",cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join("; "),...headers},
   ...(payload===undefined?{}:{payload:JSON.stringify(payload),headers:{origin:"http://localhost:3000",cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join("; "),"content-type":"application/json",...headers}})});
  for(const cookie of response.cookies){if(cookie.value)this.cookies.set(cookie.name,cookie.value);else this.cookies.delete(cookie.name);}
  return response;
 }
 async get<T>(path:string){const r=await this.raw("GET",path);return {status:r.statusCode,body:r.json<T>(),response:r};}
 async mutate<T>(method:TestHttpMethod,path:string,payload?:unknown,key:string=randomUUID()){
  const csrf=await this.get<{csrfToken:string}>("/auth/csrf");expect(csrf.status).toBe(200);
  const r=await this.raw(method,path,payload,{"x-csrf-token":csrf.body.csrfToken,"idempotency-key":key});
  return {status:r.statusCode,body:r.json<T>(),response:r};
 }
 post<T>(path:string,payload?:unknown,key?:string){return this.mutate<T>("POST",path,payload,key);}
 async login(email=adminEmail,pass=password){const r=await this.post<{user:Identified}>("/auth/login",{email,password:pass});expect(r.status,JSON.stringify(r.body)).toBe(200);return r;}
}
const admin=new Session();const worker=new Session();
async function product(stock="10",fields:Record<string,unknown>={}){
 const sku=`TEST-${randomUUID()}`;
 const r=await admin.post<ProductResult>("/products",{sku,barcode:`CODE-${randomUUID()}`,name:"Produit de test",unit:"piece",purchasePrice:"5.000",sellingPrice:"12.000",taxRate:"19",minimumStock:"3",...fields});
 expect(r.status,JSON.stringify(r.body)).toBe(201);
 if(stock!=="0")expect((await admin.post("/stock-movements",{productId:r.body.id,warehouseId,type:"ENTRY",quantity:stock,idempotencyKey:randomUUID()})).status).toBe(201);
 return r.body;
}
async function draft(kind="invoices",lines:unknown[]=[{description:"Prestation test",quantity:"1",unit:"forfait",unitPrice:"100.000",taxRate:"19"}]){
 const r=await admin.post<DocumentResult>(`/${kind}`,{customerId,warehouseId,lines});expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body;
}
async function action(path:string,body?:unknown,key?:string){const r=await admin.post<DocumentResult>(path,body,key);expect(r.status,JSON.stringify(r.body)).toBeGreaterThanOrEqual(200);expect(r.status,JSON.stringify(r.body)).toBeLessThan(300);return r.body;}

beforeAll(async()=>{
 // Import the real tsc output: Nest constructor metadata is not emitted by esbuild.
 const bootstrap=await import(new URL("../../dist/bootstrap.js",import.meta.url).href) as typeof import("../../src/bootstrap.js");
 const prismaModule=await import(new URL("../../dist/prisma/prisma.service.js",import.meta.url).href) as typeof import("../../src/prisma/prisma.service.js");
 app=await bootstrap.createApplication({logging:false,shutdownHooks:false});server=app.getHttpAdapter().getInstance();db=app.get(prismaModule.PrismaService);
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 await db.$transaction(async tx=>{
  const company=await tx.company.create({data:{slug:process.env.COMPANY_SLUG!,name:"Integration Company",businessSettings:{create:{}}}});companyId=company.id;
  await tx.permission.createMany({data:Object.values(Permissions).map(code=>({code})),skipDuplicates:true});const permissions=await tx.permission.findMany();
  for(const roleCode of ["ADMIN","WORKER"] as const){const role=await tx.role.create({data:{companyId,code:roleCode,name:roleCode,permissions:{create:permissions.filter(p=>ROLE_PERMISSIONS[roleCode].some(code=>code===p.code)).map(p=>({permissionId:p.id}))}}});
   const user=await tx.user.create({data:{companyId,email:roleCode==="ADMIN"?adminEmail:workerEmail,name:roleCode,passwordHash:hash,roles:{create:{roleId:role.id}}}});if(roleCode==="ADMIN")adminId=user.id;else workerId=user.id;}
  warehouseId=(await tx.warehouse.create({data:{companyId,code:"MAIN",name:"Depot principal"}})).id;
 });
 await admin.login();await worker.login(workerEmail);
 const customer=await admin.post<Identified>("/customers",{type:"COMPANY",companyName:"Client Integration",contactName:"Personne Test",email:"customer@example.test",billingAddress:"Tunis, Tunisie"});expect(customer.status).toBe(201);customerId=customer.body.id;
});
afterAll(async()=>{if(app)await app.close();});

describe("authentication and permission boundaries",()=>{
 it("does not accept cookie-authenticated writes without CSRF or with a foreign Origin",async()=>{
  const session=new Session();const missing=await session.raw("POST","/auth/login",{email:adminEmail,password});expect(missing.statusCode).toBe(403);
  const csrf=await session.get<{csrfToken:string}>("/auth/csrf");const foreign=await session.raw("POST","/auth/login",{email:adminEmail,password},{origin:"https://attacker.example","x-csrf-token":csrf.body.csrfToken});expect(foreign.statusCode).toBe(403);
 });
 it("authenticates Admin and Worker without returning token strings",async()=>{const a=await admin.get<{user:{roles:string[]}}>("/auth/me");expect(a.body.user.roles).toContain("ADMIN");const w=await worker.get<{user:{roles:string[]}}>("/auth/me");expect(w.body.user.roles).toContain("WORKER");expect(JSON.stringify(w.body)).not.toMatch(/passwordHash|accessToken|refreshToken/);});
 it("denies Worker financial, user, setting and product mutations",async()=>{
  for(const route of ["/users","/roles","/invoices","/quotes","/delivery-notes","/payments","/settings","/audit-logs","/reports/dashboard"]){expect((await worker.get(route)).status,route).toBe(403);}
  expect((await worker.post("/products",{})).status).toBe(403);
 });
 it("finds an old session after more than 50 unrelated sessions",async()=>{
  const session=new Session();await session.login();const old=session.cookies.get("as_tino_refresh");
  await db.refreshSession.createMany({data:Array.from({length:70},()=>({userId:workerId,familyId:randomUUID(),tokenHash:createHash("sha256").update(randomBytes(32)).digest("hex"),expiresAt:new Date(Date.now()+86400_000)}))});
  expect((await session.post("/auth/refresh")).status).toBe(200);expect(session.cookies.get("as_tino_refresh")).not.toBe(old);
 });
 it("revokes a token family when a rotated refresh token is replayed",async()=>{
  const session=new Session();await session.login();const stale=new Session();stale.cookies=new Map(session.cookies);
  expect((await session.post("/auth/refresh")).status).toBe(200);expect((await stale.post("/auth/refresh")).status).toBe(401);expect((await session.get("/auth/me")).status).toBe(401);
 });
 it("locks an account after repeated failures and audits the attempts",async()=>{
  const email=`lock-${randomUUID()}@example.test`;const user=await admin.post<Identified>("/users",{email,name:"Lockout Test",password,roleCodes:["WORKER"]});expect(user.status).toBe(201);
  const session=new Session();for(let i=0;i<5;i++)expect((await session.post("/auth/login",{email,password:randomBytes(15).toString("hex")})).status).toBe(401);
  expect((await session.post("/auth/login",{email,password})).status).toBe(401);const row=await db.user.findUniqueOrThrow({where:{id:user.body.id}});expect(row.failedLoginCount).toBeGreaterThanOrEqual(5);expect(row.lockoutUntil!.getTime()).toBeGreaterThan(Date.now());
 });
 it("deactivation revokes existing access immediately",async()=>{
  const email=`inactive-${randomUUID()}@example.test`;const user=await admin.post<Identified>("/users",{email,name:"Inactive Test",password,roleCodes:["WORKER"]});const session=new Session();await session.login(email);
  expect((await admin.mutate("PATCH",`/users/${user.body.id}`,{status:"INACTIVE"})).status).toBe(200);expect((await session.get("/auth/me")).status).toBe(401);
 });
 it("lets an Admin reset a Worker password and revoke all existing sessions",async()=>{
  const email=`reset-${randomUUID()}@example.test`;const user=await admin.post<Identified>("/users",{email,name:"Password Reset Test",password,roleCodes:["WORKER"]});expect(user.status).toBe(201);
  const session=new Session();await session.login(email);const newPassword=`New-${randomBytes(18).toString("base64url")}`;
  const reset=await admin.post<{ok:boolean;sessionsRevoked:number}>(`/users/${user.body.id}/reset-password`,{password:newPassword});expect(reset.status).toBe(201);expect(reset.body.ok).toBe(true);
  expect((await session.get("/auth/me")).status).toBe(401);const fresh=new Session();await fresh.login(email,newPassword);
  const logout=await admin.post<{ok:boolean}>(`/users/${user.body.id}/logout-all`);expect(logout.status).toBe(201);expect(logout.body.ok).toBe(true);expect((await fresh.get("/auth/me")).status).toBe(401);
 });
 it("password reset gives the same public response and stores only a token hash",async()=>{
  const session=new Session();const registered=await session.post("/auth/password-reset",{email:workerEmail});const unknown=await session.post("/auth/password-reset",{email:`unknown-${randomUUID()}@example.test`});
  expect(registered.status).toBe(202);expect(unknown.status).toBe(202);expect(registered.body).toEqual(unknown.body);expect(JSON.stringify(registered.body)).not.toContain("token");
  const token=await db.passwordResetToken.findFirstOrThrow({where:{userId:workerId},orderBy:{createdAt:"desc"}});expect(token.tokenHash).toMatch(/^[a-f0-9]{64}$/);
 });
 it("logout ends the current device session",async()=>{const session=new Session();await session.login();expect((await session.post("/auth/logout")).status).toBe(200);expect((await session.get("/auth/me")).status).toBe(401);});
});

describe("inventory, concurrency and immutable history",()=>{
 it("creates, updates, scans and archives products with no financial leak",async()=>{
  const p=await product("5");const patch=await admin.mutate<ProductResult>("PATCH",`/products/${p.id}`,{name:"Updated product",sellingPrice:"13.001"});expect(patch.status).toBe(200);
  const scan=await worker.get<ProductResult>(`/scan/${p.barcode}`);expect(scan.body.id).toBe(p.id);expect(scan.body).not.toHaveProperty("purchasePrice");expect(scan.body).not.toHaveProperty("sellingPrice");
  expect((await admin.mutate("PATCH",`/products/${p.id}/archive`)).status).toBe(200);expect((await worker.get(`/products/${p.id}`)).status).toBe(404);
 });
 it("allows only one of two simultaneous withdrawals of the final units",async()=>{
  const p=await product("1");const jobs=[1,2].map(()=>worker.post<MovementResult>("/scan/withdraw",{code:p.sku,warehouseId,quantity:"1",idempotencyKey:randomUUID()}));
  const result=await Promise.all(jobs);expect(result.map(r=>r.status).sort()).toEqual([201,409]);const balance=await db.stockBalance.findUniqueOrThrow({where:{productId_warehouseId:{productId:p.id,warehouseId}}});expect(balance.quantity.toFixed(3)).toBe("0.000");
  expect(await db.stockMovement.count({where:{productId:p.id,type:"WITHDRAWAL"}})).toBe(1);
 });
 it("persists idempotency and rejects a reused key with a changed payload",async()=>{
  const p=await product("5");const body={code:p.sku,warehouseId,quantity:"2",idempotencyKey:randomUUID()};const result=await Promise.all([worker.post<MovementResult>("/scan/withdraw",body),worker.post<MovementResult>("/scan/withdraw",body)]);
  expect(result[0]!.status).toBe(201);expect(result[1]!.body.id).toBe(result[0]!.body.id);expect((await worker.post("/scan/withdraw",{...body,quantity:"1"})).status).toBe(409);
  expect((await worker.get<ProductResult>(`/products/${p.id}`)).body.quantity).toBe("3.000");
 });
 it("isolates Worker history even when a different user filter is supplied",async()=>{const result=await worker.get<{items:MovementResult[]}>(`/stock-movements?userId=${adminId}&pageSize=100`);expect(result.status).toBe(200);expect(result.body.items.length).toBeGreaterThan(0);expect(result.body.items.every(m=>m.userId===workerId)).toBe(true);});
 it("returns a safe stock overview for the mobile stock workspace",async()=>{const result=await worker.get<{productCount:number;totalStockQuantity:string;movementCount24h:number;warehouseBreakdown:{name:string;quantity:string}[]}>("/stock-movements/overview");expect(result.status).toBe(200);expect(result.body.productCount).toBeGreaterThan(0);expect(Array.isArray(result.body.warehouseBreakdown)).toBe(true);expect(result.body).not.toHaveProperty("inventoryValue");});
 it("reverses a movement once and preserves the original row",async()=>{
  const p=await product("5");const out=await worker.post<MovementResult>("/scan/withdraw",{code:p.sku,warehouseId,quantity:"2",idempotencyKey:randomUUID()});
  const reversal=await admin.post<MovementResult>(`/stock-movements/${out.body.id}/reverse`,{reason:"Correction test justifiee",idempotencyKey:randomUUID()});expect(reversal.status).toBe(201);expect(reversal.body.quantityAfter).toBe("5");
  expect((await admin.post(`/stock-movements/${out.body.id}/reverse`,{reason:"Deuxieme correction",idempotencyKey:randomUUID()})).status).toBe(409);
  expect(await db.stockMovement.count({where:{id:out.body.id}})).toBe(1);expect(await db.stockMovement.count({where:{reversedMovementId:out.body.id}})).toBe(1);
 });
 it("enforces immutability and ledger consistency inside PostgreSQL",async()=>{
  const movement=await db.stockMovement.findFirstOrThrow({where:{companyId}});const audit=await db.auditLog.findFirstOrThrow({where:{companyId}});
  await expect(db.stockMovement.update({where:{id:movement.id},data:{note:"Forbidden direct edit"}})).rejects.toThrow();
  await expect(db.auditLog.delete({where:{id:audit.id}})).rejects.toThrow();
  const p=await product("0");await expect(db.stockBalance.update({where:{productId_warehouseId:{productId:p.id,warehouseId}},data:{quantity:"9"}})).rejects.toThrow();
 });
 it("records and resolves a Worker mistake report",async()=>{
  const movement=await db.stockMovement.findFirstOrThrow({where:{companyId,userId:workerId,type:"WITHDRAWAL"}});
  const incident=await worker.post<Identified>(`/stock-movements/${movement.id}/report`,{description:"Quantite a verifier par le responsable",idempotencyKey:randomUUID()});expect(incident.status).toBe(201);
  expect((await admin.post(`/stock-movements/incidents/${incident.body.id}/resolve`,{resolution:"Controle effectue, aucune correction necessaire"})).status).toBe(201);
  expect((await db.stockIncident.findUniqueOrThrow({where:{id:incident.body.id}})).resolvedAt).not.toBeNull();
  expect((await worker.post(`/stock-movements/${movement.id}/reverse`,{reason:"Operation interdite",idempotencyKey:randomUUID()})).status).toBe(403);
 });
 it("rejects cross-company references",async()=>{
  const other=await db.company.create({data:{slug:`other-${randomUUID()}`,name:"Other company",businessSettings:{create:{}}}});const category=await db.productCategory.create({data:{companyId:other.id,name:"Other"}});
  const result=await admin.post("/products",{sku:randomUUID(),name:"Cross tenant",categoryId:category.id,purchasePrice:"1",sellingPrice:"2"});expect(result.status).toBe(400);
 });
});

describe("commercial workflows, payments, PDFs and reports",()=>{
 it("converts an accepted quotation once and preserves its line snapshots",async()=>{
  const quote=await draft("quotes");await action(`/quotes/${quote.id}/send`);await action(`/quotes/${quote.id}/accept`);
  const invoices=await Promise.all([admin.post<DocumentResult>(`/quotes/${quote.id}/to-invoice`),admin.post<DocumentResult>(`/quotes/${quote.id}/to-invoice`)]);expect(invoices[0]!.body.id).toBe(invoices[1]!.body.id);
  expect(invoices[0]!.body.total).toBe("119");expect(await db.invoice.count({where:{quoteId:quote.id}})).toBe(1);
 });
 it("allocates distinct sequential official numbers under concurrent requests",async()=>{
  const drafts=await Promise.all(Array.from({length:8},()=>draft("quotes")));const issued=await Promise.all(drafts.map(doc=>action(`/quotes/${doc.id}/send`)));
  const numbers=issued.map(doc=>doc.number!);expect(new Set(numbers).size).toBe(8);const sequence=numbers.map(n=>Number(n.split("-").at(-1))).sort((a,b)=>a-b);expect(sequence[7]!-sequence[0]!).toBe(7);
 });
 it("rolls back an entire delivery when one line has insufficient stock",async()=>{
  const full=await product("3");const empty=await product("0");const note=await draft("delivery-notes",[full,empty].map(p=>({productId:p.id,description:"Delivery product",quantity:"1",unit:"piece",unitPrice:"12",taxRate:"19"})));
  expect((await admin.post(`/delivery-notes/${note.id}/confirm`)).status).toBe(409);expect(await db.stockMovement.count({where:{deliveryNoteId:note.id}})).toBe(0);
  expect((await worker.get<ProductResult>(`/products/${full.id}`)).body.quantity).toBe("3.000");expect((await db.deliveryNote.findUniqueOrThrow({where:{id:note.id}})).status).toBe("DRAFT");
 });
 it("deducts stock once for a delivery and cancels through reversal movements",async()=>{
  const p=await product("7");const note=await draft("delivery-notes",[{productId:p.id,description:"Delivery product",quantity:"2",unit:"piece",unitPrice:"12",taxRate:"19"}]);const key=randomUUID();
  await action(`/delivery-notes/${note.id}/confirm`,undefined,key);await action(`/delivery-notes/${note.id}/confirm`,undefined,key);expect((await worker.get<ProductResult>(`/products/${p.id}`)).body.quantity).toBe("5.000");
  await action(`/delivery-notes/${note.id}/cancel`,{reason:"Annulation demandee par le client"});expect((await worker.get<ProductResult>(`/products/${p.id}`)).body.quantity).toBe("7.000");expect(await db.stockMovement.count({where:{deliveryNoteId:note.id}})).toBe(2);
 });
 it("serializes payment races and restores balances through payment cancellation",async()=>{
  const invoice=await draft();await action(`/invoices/${invoice.id}/issue`);const jobs=await Promise.all([1,2].map(()=>admin.post<{payment:Identified}>("/payments",{invoiceId:invoice.id,amount:"119.000",method:"CASH",idempotencyKey:randomUUID()})));
  expect(jobs.map(r=>r.status).sort()).toEqual([201,409]);const paid=await admin.get<DocumentResult>(`/invoices/${invoice.id}`);expect(paid.body.status).toBe("PAID");expect(paid.body.remainingAmount).toBe("0");
  const payment=jobs.find(r=>r.status===201)!.body.payment;await action(`/payments/${payment.id}/cancel`,{reason:"Encaissement saisi par erreur"});const current=await admin.get<DocumentResult>(`/invoices/${invoice.id}`);expect(current.body.remainingAmount).toBe("119");expect(current.body.status).toBe("ISSUED");
 });
 it("rejects editing an issued invoice both through HTTP and direct SQL",async()=>{
  const invoice=await draft();await action(`/invoices/${invoice.id}/issue`);
  expect((await admin.mutate("PATCH",`/invoices/${invoice.id}`,{customerId,version:2,lines:[{description:"Modified",quantity:"1",unit:"piece",unitPrice:"1",taxRate:"0"}]})).status).toBe(409);
  await expect(db.invoice.update({where:{id:invoice.id},data:{notes:"Silent edit"}})).rejects.toThrow();
 });
 it("renders a real PDF, stores it and returns identical original bytes after changes",async()=>{
  const invoice=await draft();await action(`/invoices/${invoice.id}/issue`);const first=await admin.raw("GET",`/invoices/${invoice.id}/pdf`);expect(first.statusCode,first.body.slice(0,200)).toBe(200);expect(first.rawPayload.subarray(0,5).toString()).toBe("%PDF-");
  await admin.mutate("PATCH",`/customers/${customerId}`,{type:"COMPANY",companyName:"Renamed live customer",contactName:"Other contact",email:"updated@example.test"});
  const second=await admin.raw("GET",`/invoices/${invoice.id}/pdf`);expect(second.rawPayload.equals(first.rawPayload)).toBe(true);expect(await db.fileAsset.count({where:{entityType:"INVOICE",entityId:invoice.id}})).toBe(1);
 });
 it("calculates the dashboard from the whole database rather than a capped page",async()=>{
  await db.product.createMany({data:Array.from({length:105},()=>({companyId,sku:randomUUID(),name:"Extra inventory product",purchasePrice:"1",sellingPrice:"2"}))});
  const response=await admin.get<Record<string,unknown>>("/reports/dashboard");expect(response.status,JSON.stringify(response.body)).toBe(200);const expected=await db.product.count({where:{companyId,status:"ACTIVE"}});expect(response.body.productCount).toBe(expected);
  const csv=await admin.raw("GET","/reports/stock.csv");expect(csv.statusCode).toBe(200);expect(csv.headers["content-type"]).toContain("text/csv");
 });
 it("records audit events for stock, issuance and payments",async()=>{const actions=await db.auditLog.findMany({where:{companyId},select:{action:true}});expect(actions.map(a=>a.action)).toEqual(expect.arrayContaining(["stock.created","stock.reversed","document.issued","payment.created","payment.cancelled"]));});
});
