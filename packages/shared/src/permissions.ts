export const Permissions = {
  DashboardRead: "dashboard:read",
  ProductRead: "product:read",
  ProductWrite: "product:write",
  StockRead: "stock:read",
  StockReadAll: "stock:read-all",
  StockReportMistake: "stock:report-mistake",
  StockAdjust: "stock:adjust",
  StockWithdraw: "stock:withdraw",
  UserManage: "user:manage",
  CustomerManage: "customer:manage",
  DocumentManage: "document:manage",
  PaymentManage: "payment:manage",
  FinancialRead: "financial:read",
  ReportRead: "report:read",
  AuditRead: "audit:read",
  SettingsManage: "settings:manage"
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const RoleCodes = {
  Admin: "ADMIN",
  Worker: "WORKER"
} as const;

export type RoleCode = (typeof RoleCodes)[keyof typeof RoleCodes];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  ADMIN: Object.values(Permissions),
  WORKER: [
    Permissions.ProductRead,
    Permissions.StockRead,
    Permissions.StockWithdraw,
    Permissions.StockReportMistake,
    Permissions.DashboardRead
  ]
};

export function hasPermission(
  userPermissions: readonly string[],
  requiredPermission: Permission
): boolean {
  return userPermissions.includes(requiredPermission);
}

export function permissionsForRoles(roles: readonly RoleCode[]): Permission[] {
  return Array.from(new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? [])));
}
