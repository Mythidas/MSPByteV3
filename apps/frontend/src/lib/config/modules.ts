import type { Permission } from '$lib/utils/permissions';

export type ModuleNavLink = {
  href: string;
  label: string;
  permission: Permission | null;
};

export type ModuleConfig = {
  id: string;
  label: string;
  basePath: string;
  permission: Permission | null;
  navLinks: ModuleNavLink[];
};

export type GlobalNavLink = {
  kind: 'link';
  href: string;
  label: string;
  permission: Permission | null;
};

export type GlobalNavGroup = {
  kind: 'group';
  label: string;
  children: { href: string; label: string; permission: Permission }[];
};

export type GlobalNavItem = GlobalNavLink | GlobalNavGroup;

export const MODULES: ModuleConfig[] = [
  {
    id: 'mspagent',
    label: 'MSPAgent',
    basePath: '/mspagent',
    permission: 'Integrations.Read',
    navLinks: [
      { href: '/mspagent/agents', label: 'Agents', permission: null },
      { href: '/mspagent/tickets', label: 'Tickets', permission: null },
      { href: '/mspagent/logs', label: 'Logs', permission: null },
    ],
  },
];

export const GLOBAL_NAV_ITEMS: GlobalNavItem[] = [
  { kind: 'link', href: '/sites', label: 'Sites', permission: 'Sites.Read' },
  {
    kind: 'group',
    label: 'Admin',
    children: [
      { href: '/users', label: 'Users', permission: 'Users.Read' },
      { href: '/roles', label: 'Roles', permission: 'Roles.Read' },
      { href: '/integrations', label: 'Integrations', permission: 'Integrations.Read' },
      { href: '/reports/reconcilliation', label: 'Reports', permission: 'Reports.Read' },
    ],
  },
];

export const DEFAULT_ROUTE = '/mspagent/agents';
