import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
export { Prisma, PrismaClient } from "@prisma/client";
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 5000 }) });
}
