import type { Permission } from './permissions';

const ROUTE_PERMISSIONS: [string, Permission][] = [
  ['/sites', 'Sites.Read'],
  ['/integrations', 'Integrations.Read'],
  ['/reports', 'Reports.Read'],
  ['/users', 'Users.Read'],
  ['/roles', 'Roles.Read'],
];

export function getRoutePermission(pathname: string): Permission | null {
  for (const [prefix, perm] of ROUTE_PERMISSIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return perm;
    }
  }
  return null;
}
