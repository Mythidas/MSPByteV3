export type Permission =
  | 'Global.Admin'
  | 'Sites.Read'
  | 'Sites.Write'
  | 'Integrations.Read'
  | 'Integrations.Write'
  | 'Reports.Read'
  | 'Users.Read'
  | 'Users.Write'
  | 'Assets.Read'
  | 'Assets.Write';

export const PERMISSION_CATEGORIES = [
  { category: 'Sites', permissions: ['Sites.Read', 'Sites.Write'] as Permission[] },
  {
    category: 'Integrations',
    permissions: ['Integrations.Read', 'Integrations.Write'] as Permission[],
  },
  { category: 'Reports', permissions: ['Reports.Read', 'Reports.Write'] as Permission[] },
  { category: 'Users', permissions: ['Users.Read', 'Users.Write'] as Permission[] },
];

export const ALL_PERMISSIONS: Permission[] = [
  'Global.Admin',
  ...PERMISSION_CATEGORIES.flatMap((c) => [...c.permissions]),
];

type Attributes = Record<string, unknown> | null;

export function hasPermission(attributes: Attributes, permission: Permission): boolean {
  if (!attributes) return false;
  if (attributes['Global.Admin'] === true) return true;
  if (attributes[permission] === true) return true;
  // Write implies Read
  if (permission.endsWith('.Read')) {
    const writePerm = permission.replace('.Read', '.Write');
    if (attributes[writePerm] === true) return true;
  }
  return false;
}

export function hasAnyPermission(attributes: Attributes, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(attributes, p));
}

export const ROLE_LEVELS = [
  { value: 1, label: 'Basic' },
  { value: 2, label: 'Elevated' },
  { value: 3, label: 'Admin' },
  { value: 4, label: 'Super Admin' },
  { value: 5, label: 'Global Admin' },
];

export function canActOnLevel(
  myLevel: number | null | undefined,
  targetLevel: number | null | undefined
): boolean {
  if (myLevel == null || targetLevel == null) return false;
  return myLevel >= targetLevel;
}
