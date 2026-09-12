import { it,expect,vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { NumberingService } from "../../src/documents/numbering.service.js";
it("allocates with one PostgreSQL atomic upsert and preserves the persisted annual prefix",async()=>{
 const query=vi.fn().mockResolvedValue([{prefix:"FAC",allocated:42}]);
 const tx={company:{findUniqueOrThrow:vi.fn().mockResolvedValue({timezone:"Africa/Tunis",businessSettings:{quotePrefix:"DEV",invoicePrefix:"NEW",deliveryNotePrefix:"BL"}})},$queryRaw:query} as unknown as Prisma.TransactionClient;
 expect(await new NumberingService().allocate(tx,"company","INVOICE",new Date("2026-12-31T23:30:00Z"))).toBe("FAC-2027-0042");
 expect(query).toHaveBeenCalledTimes(1);
 const sql=query.mock.calls[0]![0] as {strings:string[];values:unknown[]};expect(sql.strings.join("")).toContain("ON CONFLICT");expect(sql.values).toContain(2027);
});
