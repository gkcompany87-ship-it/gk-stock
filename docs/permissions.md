# Permissions

The source of truth is `packages/shared/src/permissions.ts` plus database Role/Permission relations. Guards and service entry points both enforce permissions. An Admin is not identified by a magic user id or trusted client flag.

| Permission | Admin | Worker | Additional restriction |
|---|---|---|---|
| dashboard:read | Yes | Yes | Worker dashboard is personal only |
| product:read | Yes | Yes | Worker sees active products; price/tax fields stripped |
| product:write | Yes | No | Tenant-scoped create/edit/archive/image/category |
| stock:read | Yes | Yes | Worker is forced to own movements/incidents |
| stock:read-all | Yes | No | Required to see other users |
| stock:withdraw | Yes | Yes | Positive quantity, allowed stock, active catalogue |
| stock:report-mistake | Yes | Yes | Own movement unless stock:read-all |
| stock:adjust | Yes | No | Reasons required for damage/adjustment/reversal |
| customer:manage | Yes | No | Timeline additionally requires financial access |
| document:manage | Yes | No | Also requires financial:read |
| payment:manage | Yes | No | Also requires financial:read |
| financial:read | Yes | No | Never inferred from a frontend route |
| report:read | Yes | No | Financial reports require financial:read |
| user:manage | Yes | No | Cannot remove the final active manager |
| audit:read | Yes | No | No audit-edit/delete endpoint |
| settings:manage | Yes | No | Negative-stock switch requires explicit change |

Custom roles can combine named permissions. Built-in roles are protected against casual redefinition. Existing sessions are revoked when sensitive user/role changes are made, and every authenticated request checks the current active user and role assignments. Do not add a new controller method without the matching service-level check and regression test.

No permission permits silent editing/deletion of confirmed stock history, issued lines or audit logs. Administrators correct through traced reversal/cancellation workflows, not SQL or UI delete buttons.
