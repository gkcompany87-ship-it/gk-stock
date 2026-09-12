import { Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { chromium, type Browser } from "playwright-core";
import type { DocumentSnapshot } from "../documents/document-types.js";
import { documentFooter, documentHtml } from "./document-template.js";
@Injectable()
export class PdfService implements OnModuleDestroy {
  private browser?: Promise<Browser>;
  private active = 0;
  constructor(private readonly config: ConfigService) {}
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) this.browser = chromium.launch({ executablePath: this.config.getOrThrow<string>("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"),
      chromiumSandbox: this.config.get("PDF_DISABLE_SANDBOX") !== "true", args: ["--disable-dev-shm-usage"], timeout: 20_000 }).catch(error => { this.browser = undefined; throw error; });
    const browser = await this.browser;
    if (!browser.isConnected()) { this.browser = undefined; return this.getBrowser(); }
    return browser;
  }
  async render(doc: DocumentSnapshot, options: Parameters<typeof documentHtml>[1] = {}): Promise<Buffer> {
    if (this.active >= 2) throw new ServiceUnavailableException("Generation PDF occupee. Reessayez dans quelques instants.");
    this.active++;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block", locale: doc.locale });
      const timer = setTimeout(() => { void context.close().catch(() => undefined); }, 30_000);
      timer.unref();
      try {
        // No remote fonts, URLs or scripts: prevents SSRF through any document field.
        await context.route("**/*", route => route.request().url().startsWith("data:") ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.setContent(documentHtml(doc, options), { waitUntil: "load", timeout: 15_000 });
        return await page.pdf({ format: "A4", printBackground: true, tagged: true, displayHeaderFooter: true, headerTemplate: "<span></span>",
          footerTemplate: documentFooter(doc), margin: { top: "14mm", right: "14mm", bottom: "21mm", left: "14mm" } });
      } finally { clearTimeout(timer); await context.close(); }
    } catch { throw new ServiceUnavailableException("Generation PDF indisponible. Verifiez Chromium et sa configuration de securite."); }
    finally { this.active--; }
  }
  async onModuleDestroy() { if (this.browser) await (await this.browser).close(); }
}
