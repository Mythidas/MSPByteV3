import type { PipelineTracker } from "./lib/tracker.js";
import type { IngestJobData, LinkJobData, EnrichJobData } from "./types.js";
import type { IntegrationId } from "@workspace/shared/config/integrations.js";

// ─── Processed Row ───────────────────────────────────────────────────────────

export interface ProcessedRow {
  id: string;
  external_id: string;
  link_id: string | null;
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export interface RawEntity {
  type: string;
  [key: string]: unknown;
}

export interface IAdapter<TRaw extends RawEntity = RawEntity> {
  fetch(job: IngestJobData, tracker: PipelineTracker): Promise<TRaw[]>;
}

// ─── Processor ───────────────────────────────────────────────────────────────

export interface IProcessor<TRaw extends RawEntity = RawEntity> {
  process(entities: TRaw[], job: IngestJobData, tracker: PipelineTracker): Promise<ProcessedRow[]>;
  pruneStale(processedRows: ProcessedRow[], job: IngestJobData, tracker: PipelineTracker): Promise<number>;
}

// ─── Linker ──────────────────────────────────────────────────────────────────

export interface LinkRecord {
  id: string;
  tenant_id: string;
  site_id: string | null;
  external_id: string | null;
  meta: Record<string, unknown> | null;
}

export interface ILinker {
  link(
    job: LinkJobData,
    linkRecord: LinkRecord,
    tracker: PipelineTracker,
  ): Promise<void>;
}

// ─── Enricher ────────────────────────────────────────────────────────────────

export interface IEnricher {
  enrich(job: EnrichJobData, tracker: PipelineTracker): Promise<void>;
}

// ─── Integration definition ──────────────────────────────────────────────────

export interface IngestorDefinition {
  integrationId: IntegrationId;
  adapter: IAdapter;
  processor: IProcessor;
  linker: ILinker;
  enricher: IEnricher;
  /** Dep types that must be fresh before a link job fires (keyed by op name) */
  linkOpDeps: Record<string, string[]>;
  /** Dep types that must be fresh before an enrich job fires (keyed by op name) */
  enrichOpDeps: Record<string, string[]>;
  staleThresholdMs: Record<string, number> | number;
  /** Optional fan-out hook called after processor+prune; used to spawn child ingest jobs */
  fanOut?: (rows: ProcessedRow[], job: IngestJobData) => Promise<void>;
}
