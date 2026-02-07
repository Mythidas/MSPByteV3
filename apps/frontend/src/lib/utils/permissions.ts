export type Permission =
  | 'Global.Admin'
  | 'Sites.Read'
  | 'Sites.Write'
  | 'Integrations.Read'
  | 'Integrations.Write'
  | 'Reports.Read'
  | 'Reports.Write';

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
