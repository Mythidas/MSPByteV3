import type { AdapterContract, UpsertPayload } from "@workspace/core/types/contracts/adapter";
import type { LinkerContract } from "@workspace/core/types/contracts/linker";
import type { EnrichmentContract } from "@workspace/core/types/contracts/enrichment";
import type { IntegrationId } from "@workspace/core/types/integrations";
import type { IngestJobData } from "./types.js";

// ─── Processed Row ─────────────────────────────────────────────────────────
// Retained for any internal helpers that still reference it (e.g. stale pruning)

export interface ProcessedRow {
  id: string;
  external_id: string;
  link_id: string | null;
}

// ─── Integration definition ──────────────────────────────────────────────────

export interface IngestorDefinition {
  integrationId: IntegrationId;
  adapter: AdapterContract;
  linkers: LinkerContract[];
  enrichments: EnrichmentContract[];
  /** Optional fan-out hook called after upserts; used to spawn child ingest jobs */
  fanOut?: (payloads: UpsertPayload[], job: IngestJobData) => Promise<void>;
}
