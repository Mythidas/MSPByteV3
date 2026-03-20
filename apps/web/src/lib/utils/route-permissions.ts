import type { Permission } from "./permissions";

const ROUTE_PERMISSIONS: [string, Permission][] = [
  ["/sites", "Sites.Read"],
  ["/integrations", "Integrations.Read"],
  ["/users", "Users.Read"],
  ["/roles", "Users.Read"],
  ["/automation", "Automation.Read"],
];

export function getRoutePermission(pathname: string): Permission | null {
  for (const [prefix, perm] of ROUTE_PERMISSIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return perm;
    }
  }
  return null;
}
