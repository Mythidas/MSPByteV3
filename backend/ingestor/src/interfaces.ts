import { IntegrationId } from "@workspace/shared/types/integrations.js";
import {
  AdapterContract,
  UpsertPayload,
} from "@workspace/shared/types/jobs/contracts/adapter.js";
import { EnrichmentContract } from "@workspace/shared/types/jobs/contracts/enrichment.js";
import { LinkerContract } from "@workspace/shared/types/jobs/contracts/linker.js";
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
