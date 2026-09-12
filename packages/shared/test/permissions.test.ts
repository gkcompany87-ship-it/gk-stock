import { describe, expect, it } from "vitest";
import { Permissions, hasPermission, permissionsForRoles } from "../src/permissions.js";

describe("permissions", () => {
  it("gives Admin all permissions", () => {
    expect(permissionsForRoles(["ADMIN"])).toContain(Permissions.SettingsManage);
    expect(permissionsForRoles(["ADMIN"])).toContain(Permissions.FinancialRead);
  });

  it("restricts Worker financial and administration actions", () => {
    const workerPermissions = permissionsForRoles(["WORKER"]);
    expect(hasPermission(workerPermissions, Permissions.StockWithdraw)).toBe(true);
    expect(hasPermission(workerPermissions, Permissions.UserManage)).toBe(false);
    expect(hasPermission(workerPermissions, Permissions.FinancialRead)).toBe(false);
  });
});
