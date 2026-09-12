import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const origin="http://127.0.0.1:3100";
function credential(key:string){const value=process.env[key];if(!value)throw new Error(`Missing ${key}. Run pnpm setup:env and pnpm test:e2e:prepare.`);return value;}
async function login(page:Page,role:"ADMIN"|"WORKER"="ADMIN") {
 await page.goto("/connexion");await page.getByLabel("Adresse e-mail",{exact:true}).fill(credential(`SEED_${role}_EMAIL`));
 await page.getByLabel("Mot de passe",{exact:true}).fill(credential(`SEED_${role}_PASSWORD`));
 await page.getByRole("button",{name:"Se connecter",exact:true}).click();await expect(page).toHaveURL(origin+"/");
}
async function mutation(request:APIRequestContext,path:string,body:unknown){
 const csrf=await request.get("/api/v1/auth/csrf");expect(csrf.ok()).toBeTruthy();const {csrfToken}=await csrf.json();
 const response=await request.post(`/api/v1${path}`,{data:body,headers:{origin,"x-csrf-token":csrfToken,"idempotency-key":randomUUID()}});
 expect(response.ok(),await response.text()).toBeTruthy();return response.json();
}
async function confirm(page:Page){const dialog=page.getByRole("alertdialog");await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:"Confirmer",exact:true}).click();}
async function select(page:Page,label:string,search:string){await page.getByLabel(label,{exact:true}).fill(search);await page.locator(".lookup-results").getByRole("button").filter({hasText:search}).first().click();}
async function close(page:Page){await page.getByRole("dialog").last().getByRole("button",{name:"Fermer",exact:true}).click();}

test("Admin creates a product; Worker manually scans and withdraws the last units",async({page,browser})=>{
 await login(page);await page.goto("/produits");await page.getByRole("button",{name:"Nouveau produit",exact:true}).click();
 const name=`E2E clavier ${randomUUID().slice(0,8)}`,sku=`E2E-${randomUUID()}`;
 await page.getByLabel("Nom du produit *",{exact:true}).fill(name);await page.getByLabel("SKU *",{exact:true}).fill(sku);
 await page.getByLabel("Code-barres / QR",{exact:true}).fill(sku);await page.getByLabel("Prix d’achat HT (TND)",{exact:true}).fill("25.125");
 await page.getByLabel("Prix de vente HT (TND)",{exact:true}).fill("45.500");await page.getByLabel("Seuil de stock minimum",{exact:true}).fill("2");
 await page.getByRole("button",{name:"Enregistrer le produit",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
 const p=await (await page.request.get(`/api/v1/scan/${sku}`)).json();const warehouses=await (await page.request.get("/api/v1/warehouses")).json();const warehouseId=warehouses.find((w:{code:string})=>w.code==="MAIN").id;
 await mutation(page.request,"/stock-movements",{productId:p.id,warehouseId,type:"ENTRY",quantity:"2",note:"Entree de test",idempotencyKey:randomUUID()});
 const context=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});const worker=await context.newPage();
 await login(worker,"WORKER");await worker.goto("/scanner");await worker.getByLabel("Code-barres, QR code ou SKU",{exact:true}).fill(sku);
 await worker.getByRole("button",{name:"Rechercher le produit",exact:true}).click();await expect(worker.getByRole("heading",{name})).toBeVisible();
 await expect(worker.getByText("Stock faible",{exact:true})).toBeVisible();await worker.getByLabel(/^Quantité prise/).fill("2");
 await worker.getByRole("button",{name:"Confirmer le retrait",exact:true}).click();await confirm(worker);await expect(worker.getByRole("heading",{name:"Retrait confirmé"})).toBeVisible();
 const product=await (await worker.request.get(`/api/v1/products/${p.id}`)).json();expect(product.quantity).toBe("0.000");expect(product).not.toHaveProperty("purchasePrice");
 await context.close();
});

test("Admin creates a customer, accepts a quote, issues the converted invoice, downloads PDF and registers payment",async({page})=>{
 await login(page);await page.goto("/clients");await page.getByRole("button",{name:"Nouveau client",exact:true}).click();
 const customer=`Client E2E ${randomUUID().slice(0,8)}`;
 await page.getByLabel("Raison sociale").fill(customer);await page.getByLabel("Nom du contact").fill("Responsable Test");
 await page.getByLabel("E-mail",{exact:true}).fill("e2e-customer@example.test");await page.getByLabel("Adresse de facturation",{exact:true}).fill("Tunis, Tunisie");
 await page.getByRole("button",{name:"Enregistrer le client",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.goto("/devis");await page.getByRole("button",{name:"Nouveau devis",exact:true}).click();await select(page,"Client *",customer);
 await page.getByLabel("Description ligne 1",{exact:true}).fill("Prestation de configuration E2E");await page.getByLabel("Prix unitaire ligne 1",{exact:true}).fill("100.000");
 await page.getByLabel("TVA ligne 1",{exact:true}).selectOption("19");await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
 await page.getByRole("button",{name:"Émettre le devis",exact:true}).click();await confirm(page);await expect(page.getByRole("button",{name:"Accepter le devis"})).toBeVisible();
 await page.getByRole("button",{name:"Accepter le devis",exact:true}).click();await confirm(page);await expect(page.getByRole("button",{name:"Convertir en facture"})).toBeVisible();
 await page.getByRole("button",{name:"Convertir en facture",exact:true}).click();
 await expect(page.getByRole("link",{name:"Ouvrir la liste correspondante"})).toBeVisible();
 // Conversion navigates to the target module; select the exact customer's document.
 await page.goto("/factures");await page.getByLabel("Rechercher un document").fill(customer);
 await page.getByRole("row").filter({hasText:customer}).getByRole("button",{name:"Ouvrir",exact:true}).click();
 await page.getByRole("button",{name:"Émettre la facture",exact:true}).click();await confirm(page);
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:/PDF/}).first().click();const download=await downloading;const path=await download.path();expect(path).not.toBeNull();expect((await readFile(path!)).subarray(0,5).toString()).toBe("%PDF-");
 await page.getByRole("button",{name:"Enregistrer un paiement",exact:true}).click();
 const payment=page.getByRole("dialog",{name:"Enregistrer un paiement",exact:true});await payment.getByLabel("Montant reçu (TND) *",{exact:true}).fill("119.000");
 await payment.getByRole("button",{name:"Enregistrer le paiement",exact:true}).click();await confirm(page);await expect(payment).toHaveCount(0);
 await expect(page.getByText("Payée",{exact:true}).first()).toBeVisible();
});

test("Admin creates and confirms a delivery note that deducts stock",async({page})=>{
 await login(page);const sku=`E2E-LIV-${randomUUID()}`;
 const product=await mutation(page.request,"/products",{name:sku,sku,unit:"piece",purchasePrice:"10",sellingPrice:"20",taxRate:"19"});
 const warehouses=await (await page.request.get("/api/v1/warehouses")).json();const warehouseId=warehouses.find((w:{code:string})=>w.code==="MAIN").id;
 await mutation(page.request,"/stock-movements",{productId:product.id,warehouseId,type:"ENTRY",quantity:"5",idempotencyKey:randomUUID()});
 await page.goto("/bons-de-livraison");await page.getByRole("button",{name:"Nouveau bon de livraison",exact:true}).click();
 const deliveryCustomer=`Client livraison E2E ${randomUUID().slice(0,8)}`;await mutation(page.request,"/customers",{type:"COMPANY",companyName:deliveryCustomer,contactName:"Responsable Livraison",email:`livraison-${randomUUID().slice(0,8)}@gk-e2e.test`,billingAddress:"Tunis, Tunisie"});
 await select(page,"Client *",deliveryCustomer);await select(page,"Produit ligne 1",sku);
 await page.getByLabel("Quantité ligne 1",{exact:true}).fill("2");await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
 await page.getByRole("button",{name:"Confirmer la livraison",exact:true}).click();await confirm(page);
 await expect(page.getByRole("button",{name:"Marquer comme livré",exact:true})).toBeVisible();
 const updated=await (await page.request.get(`/api/v1/products/${product.id}`)).json();expect(updated.quantity).toBe("3.000");
 await close(page);
});

test("Worker cannot access Admin routes or confirm offline stock mutations",async({page,context})=>{
 await login(page,"WORKER");await page.goto("/utilisateurs");await expect(page.getByText("Accès non autorisé",{exact:true})).toBeVisible();
 expect((await page.request.get("/api/v1/users")).status()).toBe(403);expect((await page.request.get("/api/v1/reports/dashboard")).status()).toBe(403);
 await page.goto("/scanner");await context.setOffline(true);await expect(page.getByText("Connexion Internet obligatoire pour confirmer un retrait.",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Rechercher le produit",exact:true})).toBeDisabled();await context.setOffline(false);
});
