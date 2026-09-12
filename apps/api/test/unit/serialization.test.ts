import { it,expect } from "vitest";
import { productDto } from "../../src/products/product-dto.js";
import { ROLE_PERMISSIONS } from "@as-tino/shared";
const actor={id:"worker",companyId:"company",name:"Worker",email:"worker@example.test",roles:["WORKER"],permissions:[...ROLE_PERMISSIONS.WORKER]};
it("strips finance from fresh and cached product responses and keeps exact total stock",()=>{
 const data={purchasePrice:"123.456",sellingPrice:"234.567",taxRate:"19",minimumStock:"2",balances:[{quantity:"1.234"},{quantity:"0.001"}]};
 const result=JSON.parse(JSON.stringify(productDto(actor,data))) as Record<string,unknown>;
 expect(result).not.toHaveProperty("purchasePrice");expect(result).not.toHaveProperty("sellingPrice");expect(result).not.toHaveProperty("taxRate");expect(result.currentQuantity).toBe("1.235");expect(result.lowStock).toBe(true);
});
