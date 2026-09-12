import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) { console.error(".env already exists; refusing to overwrite secrets."); process.exit(1); }
const secret = () => randomBytes(32).toString("base64url");
const db = secret(); const object = secret();
const values = {
  POSTGRES_PASSWORD: db,
  DATABASE_URL: `postgresql://as_tino:${db}@localhost:5432/as_tino_stock?schema=public`,
  TEST_DATABASE_URL: `postgresql://as_tino:${db}@localhost:5433/as_tino_stock_test?schema=public`,
  APP_DATABASE_PASSWORD: secret(), REDIS_PASSWORD: secret(),
  ACCESS_TOKEN_SECRET: secret(), COOKIE_SECRET: secret(),
  S3_SECRET_ACCESS_KEY: object, SEED_ADMIN_PASSWORD: secret(), SEED_WORKER_PASSWORD: secret()
};
let text = readFileSync(".env.example", "utf8");
for (const [key, value] of Object.entries(values)) text = text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
writeFileSync(".env", text, { mode: 0o600, flag: "wx" });
console.log("Created .env with unique local secrets. Never commit this file.");
console.log("Use pnpm demo:credentials to read your generated local demo credentials.");
