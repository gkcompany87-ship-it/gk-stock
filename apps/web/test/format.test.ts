import { it,expect } from "vitest";
import { money,quantity,dateInput } from "../src/lib/format.js";
import { queryString, ApiError } from "../src/lib/api.js";
it("formats money without floating point and does not truncate integer zeroes",()=>{expect(money("10000000000.001")).toBe("10\u202f000\u202f000\u202f000,001 TND");expect(quantity("10")).toBe("10");expect(quantity("100.000")).toBe("100");expect(quantity("1.250")).toBe("1,25");});
it("encodes search filters and skips only absent values",()=>{expect(queryString({search:"A&B",page:1,status:undefined,active:false})).toBe("?search=A%26B&page=1&active=false");});
it("retains correlation IDs for support",()=>{expect(new ApiError("Erreur",409,"req-1").requestId).toBe("req-1");expect(dateInput(null)).toBe("");});
