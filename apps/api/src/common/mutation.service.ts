import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { idempotencyKeySchema } from "@as-tino/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "./current-user.js";
import { canonical, digest, json } from "./json.js";
@Injectable()
export class MutationService {
  constructor(private readonly prisma: PrismaService) {}
  async run<T>(actor: AuthenticatedUser, key: string | undefined, scope: string, input: unknown,
    operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const validKey = idempotencyKeySchema.parse(key);
    const hash = digest(canonical(input));
    return this.prisma.$transaction(async (tx) => {
      // Serializes retries before reading the persistent key; also survives process restarts.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.companyId + ':' + validKey}, 0))`;
      const existing = await tx.idempotencyRecord.findUnique({ where: { companyId_key: { companyId: actor.companyId, key: validKey } } });
      if (existing) {
        if (existing.actorId !== actor.id || existing.scope !== scope || existing.requestHash !== hash)
          throw new ConflictException("Cette cle a deja ete utilisee pour une autre operation.");
        return existing.response as unknown as T;
      }
      const result = await operation(tx);
      await tx.idempotencyRecord.create({ data: { companyId: actor.companyId, actorId: actor.id, key: validKey, scope, requestHash: hash, response: json(result) } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000, maxWait: 5_000 });
  }
}
