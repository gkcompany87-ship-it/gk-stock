import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, accessSync, constants } from "node:fs";
const path = chromium.executablePath(); accessSync(path, constants.X_OK);
const text=readFileSync(".env","utf8");
writeFileSync(".env",text.replace(/^PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=.*$/m,`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=${JSON.stringify(path)}`),{mode:0o600});
console.log("Configured the installed Playwright Chromium executable in .env.");
