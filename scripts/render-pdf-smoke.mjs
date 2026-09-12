import { chromium } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||chromium.executablePath(),chromiumSandbox:process.env.PDF_DISABLE_SANDBOX!=="true"});
try {
 for(const name of ["devis","facture","livraison","multipage"]){
  const context=await browser.newContext({javaScriptEnabled:false});await context.route("**/*",route=>route.abort());
  const page=await context.newPage();await page.setContent(readFileSync(`docs/qa/pdf/${name}.html`,"utf8"),{waitUntil:"load"});
  await page.pdf({path:`docs/qa/pdf/${name}.pdf`,format:"A4",printBackground:true,displayHeaderFooter:true,headerTemplate:"<span></span>",footerTemplate:readFileSync(`docs/qa/pdf/${name}-footer.html`,"utf8"),margin:{top:"14mm",right:"13mm",bottom:"18mm",left:"13mm"}});
  await context.close();console.log(`Created docs/qa/pdf/${name}.pdf from the application template.`);
 }
} finally {await browser.close();}
