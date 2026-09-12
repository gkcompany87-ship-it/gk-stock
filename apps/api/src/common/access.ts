import { ForbiddenException } from "@nestjs/common";
import type { Permission } from "@as-tino/shared";
import type { AuthenticatedUser } from "./current-user.js";
export function assertCan(actor: AuthenticatedUser, permission: Permission): void {
  if (!actor.permissions.includes(permission)) throw new ForbiddenException("Action non autorisee.");
}
