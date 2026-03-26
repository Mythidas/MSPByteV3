import { IngestType } from "@workspace/core/types/ingest";

/** How stale ingest_sync_states entries can be and still satisfy a dependency.
 *  Keyed by IngestType. */
export const STALE_THRESHOLDS_MS: Partial<Record<IngestType, number>> = {
  [IngestType.M365Identities]: 4 * 60 * 60 * 1000, // 4h
  [IngestType.M365Groups]: 8 * 60 * 60 * 1000, // 8h
  [IngestType.M365Policies]: 8 * 60 * 60 * 1000, // 8h
  [IngestType.M365Licenses]: 24 * 60 * 60 * 1000, // 24h
  [IngestType.M365ExchangeConfig]: 24 * 60 * 60 * 1000, // 24h
  [IngestType.SophosSites]: 24 * 60 * 60 * 1000, // 24h
  [IngestType.SophosEndpoints]: 24 * 60 * 60 * 1000, // 24h
  [IngestType.DattoSites]: 24 * 60 * 60 * 1000, // 24h
  [IngestType.DattoEndpoints]: 24 * 60 * 60 * 1000, // 24h
  [IngestType.CoveSites]: 24 * 60 * 60 * 1000, // 24h
  [IngestType.CoveEndpoints]: 24 * 60 * 60 * 1000, // 24h
};

/** Debounce window: multiple ingest completions within this window share one link job. */
export const LINK_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/** Same debounce for enrich jobs. */
export const ENRICH_DEBOUNCE_MS = 5 * 60 * 1000;
