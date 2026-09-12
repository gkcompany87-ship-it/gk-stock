import { defineConfig, devices } from "@playwright/test";
import { testEnvironment } from "./scripts/test-environment.mjs";
const env = testEnvironment();
export default defineConfig({
 testDir: "./tests/e2e", fullyParallel: false, workers: 1, forbidOnly: true,
 retries: process.env.CI ? 1 : 0, timeout: 90_000,
 expect: { timeout: 15_000 }, reporter: [["list"], ["html", { open: "never" }]],
 use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
 projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
 webServer: [
  { command: "node scripts/e2e-server.mjs api", url: "http://127.0.0.1:4100/api/v1/health/ready", timeout: 120_000, reuseExistingServer: false, env },
  { command: "node scripts/e2e-server.mjs web", url: "http://127.0.0.1:3100/connexion", timeout: 120_000, reuseExistingServer: false, env }
 ]
});
