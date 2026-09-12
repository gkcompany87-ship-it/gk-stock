import { test, expect, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:3100";
function credential(key:string){const value=process.env[key];if(!value)throw new Error(`Missing ${key}.`);return value;}
async function login(page:Page){
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail",{exact:true}).fill(credential("SEED_ADMIN_EMAIL"));
  await page.getByLabel("Mot de passe",{exact:true}).fill(credential("SEED_ADMIN_PASSWORD"));
  await page.getByRole("button",{name:"Se connecter",exact:true}).click();
  await expect(page).toHaveURL(origin+"/");
}
async function noHorizontalOverflow(page:Page){
  const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client+1);
}

test("phone shell stays usable without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page);
  for(const route of ["/","/produits","/mouvements","/scanner","/utilisateurs","/devis","/factures"]){await page.goto(route);await noHorizontalOverflow(page);}
  await page.getByRole("button",{name:"Ouvrir le menu complet"}).click();
  await expect(page.locator(".sidebar")).toHaveClass(/sidebar-open/);
  await expect(page.locator(".sidebar-logout")).toBeVisible();
  await expect(page.locator(".mobile-bottom-nav")).toBeHidden();
});

test("portrait tablet shell stays usable without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:820,height:1180});
  await login(page);
  for(const route of ["/","/produits","/mouvements","/utilisateurs","/devis","/factures","/bons-de-livraison"]){await page.goto(route);await noHorizontalOverflow(page);}
  await page.getByRole("button",{name:"Ouvrir le menu"}).click();
  await expect(page.locator(".sidebar")).toHaveClass(/sidebar-open/);
  await expect(page.locator(".sidebar-logout")).toBeVisible();
});
