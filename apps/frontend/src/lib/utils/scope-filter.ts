export type ScopeType = 'site' | 'group' | 'parent' | 'connection';

export type SiteRef = { id: string; name: string; parent_id: string | null };
export type ConnectionRef = { id: string; name: string };
export type GroupRef = { id: string; name: string };
export type SiteToGroupRef = { site_id: string; group_id: string };

/**
 * Returns array of site_ids to filter by, or null for "all" (no filtering).
 */
export function getSiteIdsForScope(
  scope: string | null,
  scopeId: string | null,
  sites: SiteRef[],
  siteToGroup: SiteToGroupRef[],
): string[] | null {
  if (!scope || !scopeId) return null;

  switch (scope) {
    case 'site':
      return [scopeId];
    case 'group':
      return siteToGroup.filter((m) => m.group_id === scopeId).map((m) => m.site_id);
    case 'parent': {
      const children = sites.filter((s) => s.parent_id === scopeId).map((s) => s.id);
      return [scopeId, ...children];
    }
    default:
      return null;
  }
}

/**
 * Returns the connection_id to filter by, or null if scope is not 'connection'.
 */
export function getConnectionIdForScope(
  scope: string | null,
  scopeId: string | null,
): string | null {
  if (scope === 'connection' && scopeId) return scopeId;
  return null;
}

/** Derive the list of "parent" sites — those that have at least one child. */
export function getParentSites(sites: SiteRef[]): SiteRef[] {
  const parentIds = new Set(sites.filter((s) => s.parent_id).map((s) => s.parent_id!));
  return sites.filter((s) => parentIds.has(s.id));
}
