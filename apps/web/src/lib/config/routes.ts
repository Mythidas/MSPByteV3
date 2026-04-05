import type { Permission } from '../utils/permissions';

type Route = {
  label: string;
  href: string;
  permission: Permission;
  group?: string;
};

const ROUTES: Route[] = [
  {
    label: 'Sites',
    href: '/sites',
    permission: 'Sites.Read',
  },
  {
    label: 'Workflows',
    href: '/automation/workflows',
    permission: 'Automation.Read',
    group: 'Automation',
  },
  {
    label: 'Tasks',
    href: '/automation/tasks',
    permission: 'Automation.Read',
    group: 'Automation',
  },
  {
    label: 'Users',
    href: '/setup/users',
    permission: 'Users.Read',
    group: 'Setup',
  },
  {
    label: 'Roles',
    href: '/setup/roles',
    permission: 'Users.Read',
    group: 'Setup',
  },
  {
    label: 'Integrations',
    href: '/setup/integrations',
    permission: 'Integrations.Read',
    group: 'Setup',
  },
];

// TODO: Ensure Hook.ts is filtering All routes for permissions
export function buildRouteMap(): Map<string, Route[]> {
  const routeMap = new Map<string, Route[]>();
  routeMap.set('top', []);

  for (const route of ROUTES) {
    if (!route.group) {
      routeMap.set('top', [...routeMap.get('top')!, route]);
      continue;
    }

    if (routeMap.has(route.group)) {
      const existing = routeMap.get(route.group)!;
      routeMap.set(route.group, [...existing, route]);
    } else {
      routeMap.set(route.group, [route]);
    }
  }

  return routeMap;
}

export function getRoutePermission(pathname: string): Permission | null {
  for (const route of ROUTES) {
    if (pathname === route.href || pathname.startsWith(route.href + '/')) {
      return route.permission;
    }
  }
  return null;
}
