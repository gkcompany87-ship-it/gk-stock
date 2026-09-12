import { describe,it,expect } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { ExecutionContext } from "@nestjs/common";
import { csrfToken, validCsrf, cookieNames } from "../../src/auth/cookies.js";
import { CsrfGuard } from "../../src/common/csrf.guard.js";
import { safeSummary, canonical, digest, constantEqual } from "../../src/common/json.js";
import { assertCan } from "../../src/common/access.js";
import { Permissions,ROLE_PERMISSIONS } from "@as-tino/shared";
import { randomBytes } from "node:crypto";
const secret=randomBytes(32).toString("base64url");
const settings:Record<string,string>={NODE_ENV:"production",COOKIE_SECRET:secret,API_ALLOWED_ORIGINS:"https://stock.example.com"};
const config={get:(key:string)=>settings[key],getOrThrow:(key:string)=>{if(!settings[key])throw Error(key);return settings[key];}} as unknown as ConfigService;
function context(request:unknown){return {switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;}
describe("security primitives",()=>{
 it("binds signed CSRF to the rotating session selector",()=>{const token=csrfToken("selector-one",config);expect(validCsrf(token,"selector-one",config)).toBe(true);expect(validCsrf(token,"selector-two",config)).toBe(false);expect(validCsrf(token+"x","selector-one",config)).toBe(false);});
 it("requires CSRF and allowed Origin even for a public login mutation",()=>{const guard=new CsrfGuard(config);const token=csrfToken("anonymous",config);const request={method:"POST",headers:{origin:"https://stock.example.com","x-csrf-token":token},cookies:{[cookieNames(config).csrf]:token}};expect(guard.canActivate(context(request))).toBe(true);expect(()=>guard.canActivate(context({...request,headers:{origin:"https://attacker.example"}}))).toThrow();expect(()=>guard.canActivate(context({...request,cookies:{}}))).toThrow();expect(guard.canActivate(context({method:"GET"}))).toBe(true);});
 it("does not include sensitive keys in audit summaries",()=>{const result=safeSummary({password:"not-saved",token:"not-saved",nested:{accessToken:"not-saved",name:"visible"},message:"a".repeat(10000)});const text=JSON.stringify(result);expect(text).not.toContain("not-saved");expect(text).toContain("visible");expect(text.length).toBeLessThan(4500);});
 it("canonicalizes property order but detects payload changes",()=>{expect(digest(canonical({b:2,a:1}))).toBe(digest(canonical({a:1,b:2})));expect(digest(canonical({a:"1"}))).not.toBe(digest(canonical({a:1})));expect(constantEqual("abc","ab")).toBe(false);});
 it("checks permissions in services, not only in controllers",()=>{const worker={id:"worker",companyId:"company",email:"worker@example.test",name:"Worker",roles:["WORKER"],permissions:[...ROLE_PERMISSIONS.WORKER]};expect(()=>assertCan(worker,Permissions.StockWithdraw)).not.toThrow();expect(()=>assertCan(worker,Permissions.FinancialRead)).toThrow();});
 it("uses secure host-prefixed cookie names in production",()=>{expect(cookieNames(config).access.startsWith("__Host-")).toBe(true);});
});
