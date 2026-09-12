import argon2 from "argon2";
import { createPrismaClient } from "../src/index.js";

const db = createPrismaClient();
const slug = process.env.COMPANY_SLUG;
const email = process.env.SEED_WORKER_EMAIL?.toLowerCase();
const password = process.env.SEED_WORKER_PASSWORD;
if (!slug || !email || !password || password.length < 12) throw new Error("Missing isolated E2E fixture environment.");
if (!new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname.endsWith("_test")) throw new Error("Refusing E2E fixtures outside a *_test database.");

try {
  await db.$transaction(async tx => {
    const company = await tx.company.findUniqueOrThrow({ where: { slug } });
    const workerRole = await tx.role.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "WORKER" } } });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    const user = await tx.user.upsert({
      where: { companyId_email: { companyId: company.id, email } },
      update: { name: "Magasinier E2E", passwordHash, status: "ACTIVE", failedLoginCount: 0, lockoutUntil: null, deactivatedAt: null },
      create: { companyId: company.id, email, name: "Magasinier E2E", passwordHash }
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: workerRole.id } },
      update: {},
      create: { userId: user.id, roleId: workerRole.id }
    });
  });
  console.log("Isolated E2E Worker fixture ready.");
} finally {
  await db.$disconnect();
}
