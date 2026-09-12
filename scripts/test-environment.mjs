import { existsSync } from "node:fs";

export function testEnvironment() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test")) {
    throw new Error("Set TEST_DATABASE_URL to a dedicated database ending in _test.");
  }

  // These credentials are deliberately test-only and are forced only when the
  // isolated *_test database is selected. They are never production defaults.
  const safe = {
    NODE_ENV: "test",
    DATABASE_URL: url,
    COMPANY_NAME: "G&K E2E Test",
    COMPANY_LEGAL_NAME: "G&K E2E Test",
    COMPANY_SLUG: "gk-e2e",
    SEED_ADMIN_EMAIL: process.env.TEST_ADMIN_EMAIL || "admin@gk-e2e.test",
    SEED_ADMIN_NAME: "Administrateur E2E",
    SEED_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || "Gk-E2E-Admin-Only-2026!",
    SEED_WORKER_EMAIL: process.env.TEST_WORKER_EMAIL || "worker@gk-e2e.test",
    SEED_WORKER_PASSWORD: process.env.TEST_WORKER_PASSWORD || "Gk-E2E-Worker-Only-2026!",
    REDIS_URL: process.env.TEST_REDIS_URL || "redis://127.0.0.1:6380/1",
    S3_BUCKET: process.env.TEST_S3_BUCKET || "gk-stock-test",
    API_ALLOWED_ORIGINS: "http://127.0.0.1:3100",
    PUBLIC_APP_URL: "http://127.0.0.1:3100",
    SWAGGER_ENABLED: "false"
  };
  Object.assign(process.env, safe);
  return { ...process.env };
}
