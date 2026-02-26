export type ScopeType = 'site' | 'group' | 'connection';

export type SiteRef = { id: string; name: string };
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
  siteToGroup: SiteToGroupRef[]
): string[] | null {
  if (!scope || !scopeId) return null;

  switch (scope) {
    case 'site':
      return [scopeId];
    case 'group':
      return siteToGroup.filter((m) => m.group_id === scopeId).map((m) => m.site_id);
    default:
      return null;
  }
}

/**
 * Returns the connection_id to filter by, or null if scope is not 'connection'.
 */
export function getConnectionIdForScope(
  scope: string | null,
  scopeId: string | null
): string | null {
  if (scope === 'connection' && scopeId) return scopeId;
  return null;
}
