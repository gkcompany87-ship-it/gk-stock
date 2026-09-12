import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@as-tino/shared";
import { REQUIRED_PERMISSIONS_KEY } from "./permissions.decorator.js";
import type { AuthenticatedUser } from "./current-user.js";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const permissions = request.user?.permissions ?? [];
    return required.every((permission) => permissions.includes(permission));
  }
}
