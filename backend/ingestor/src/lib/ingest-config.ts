/** Debounce window: multiple ingest completions within this window share one link job. */
export const LINK_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/** Same debounce for enrich jobs. */
export const ENRICH_DEBOUNCE_MS = 5 * 60 * 1000;
