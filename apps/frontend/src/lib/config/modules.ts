import type { Permission } from '$lib/utils/permissions';
import type { ScopeType } from '$lib/utils/scope-filter';

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
  pickerTypes?: ScopeType[];
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
    permission: 'Assets.Read',
    navLinks: [
      { href: '/mspagent/agents', label: 'Agents', permission: null },
      { href: '/mspagent/tickets', label: 'Tickets', permission: null },
      { href: '/mspagent/logs', label: 'Logs', permission: null },
    ],
  },
  {
    id: 'dattormm',
    label: 'DattoRMM',
    basePath: '/dattormm',
    permission: 'Assets.Read',
    navLinks: [
      { href: '/dattormm/alerts', label: 'Alerts', permission: null },
      { href: '/dattormm/endpoints', label: 'Endpoints', permission: null },
      { href: '/dattormm/companies', label: 'Companies', permission: null },
    ],
  },
  {
    id: 'sophos-partner',
    label: 'Sophos Partner',
    basePath: '/sophos-partner',
    permission: 'Assets.Read',
    navLinks: [
      { href: '/sophos-partner/alerts', label: 'Alerts', permission: null },
      { href: '/sophos-partner/endpoints', label: 'Endpoints', permission: null },
      { href: '/sophos-partner/companies', label: 'Companies', permission: null },
    ],
  },
  {
    id: 'microsoft-365',
    label: 'Microsoft 365',
    basePath: '/microsoft-365',
    permission: 'Assets.Read',
    pickerTypes: ['connection', 'site', 'group', 'parent'],
    navLinks: [
      { href: '/microsoft-365/overview', label: 'Overview', permission: null },
      { href: '/microsoft-365/alerts', label: 'Alerts', permission: null },
      { href: '/microsoft-365/users', label: 'Users', permission: null },
      { href: '/microsoft-365/groups', label: 'Groups', permission: null },
      { href: '/microsoft-365/licenses', label: 'Licenses', permission: null },
      { href: '/microsoft-365/roles', label: 'Roles', permission: null },
      { href: '/microsoft-365/policies', label: 'Policies', permission: null },
      { href: '/microsoft-365/exchange', label: 'Exchange', permission: null },
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
      { href: '/roles', label: 'Roles', permission: 'Users.Read' },
      { href: '/integrations', label: 'Integrations', permission: 'Integrations.Read' },
      { href: '/reports/reconcilliation', label: 'Reports', permission: 'Reports.Read' },
    ],
  },
];

export const DEFAULT_ROUTE = '/mspagent/agents';
