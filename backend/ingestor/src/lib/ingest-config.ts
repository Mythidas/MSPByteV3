/** How stale ingest_sync_states entries can be and still satisfy a dependency.
 *  Keyed by ingest_type string. */
export const STALE_THRESHOLDS_MS: Record<string, number> = {
  // Base M365 ingest types
  identities: 4 * 60 * 60 * 1000, // 4h
  groups: 8 * 60 * 60 * 1000, // 8h
  roles: 24 * 60 * 60 * 1000, // 24h
  policies: 8 * 60 * 60 * 1000, // 8h
  licenses: 24 * 60 * 60 * 1000, // 24h
  "exchange-config": 24 * 60 * 60 * 1000, // 24h
  // Link op types (used by enricher deps)
  link_identity_groups: 8 * 60 * 60 * 1000,
  link_identity_roles: 8 * 60 * 60 * 1000,
  link_policies: 8 * 60 * 60 * 1000,
};

/** Deps each link operation requires. All must be non-stale in ingest_sync_states. */
export const LINK_OP_DEPS: Record<string, string[]> = {
  link_identity_groups: ["identities", "groups"],
  link_identity_roles: ["identities", "roles"],
  link_policies: ["policies"],
};

/** Deps the enricher requires (link op types, not base ingest types). */
export const ENRICH_OP_DEPS: string[] = [
  "link_identity_groups",
  "link_policies",
];

/** Debounce window: multiple ingest completions within this window share one link job. */
export const LINK_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/** Same debounce for enrich jobs. */
export const ENRICH_DEBOUNCE_MS = 5 * 60 * 1000;
