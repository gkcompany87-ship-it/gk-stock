import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@as-tino/shared";

export const REQUIRED_PERMISSIONS_KEY = "requiredPermissions";
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
