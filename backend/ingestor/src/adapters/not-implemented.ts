import type { AdapterContract, UpsertPayload } from "@workspace/core/types/contracts/adapter";
import type { IngestType, FreshnessWindows } from "@workspace/core/types/ingest";
import type { JobContext } from "@workspace/core/types/job";
import type { SchemaDefinition } from "@workspace/core/types/contracts/schema-registry";
import type { ComplianceTarget } from "@workspace/core/types/contracts/adapter";
import { NotImplementedError } from "./registry";

export class NotImplementedAdapter implements AdapterContract {
  readonly integrationId: string;
  readonly supportedTypes: IngestType[] = [];
  readonly freshnessWindows: FreshnessWindows = {};
  readonly schema: SchemaDefinition;
  readonly complianceTargets: Record<string, ComplianceTarget> = {};

  constructor(integrationId: string) {
    this.integrationId = integrationId;
    this.schema = { integrationId, label: integrationId, groups: {} };
  }

  async fetch(_ctx: JobContext): Promise<UpsertPayload[]> {
    throw new NotImplementedError(`${this.integrationId}: fetch() not implemented`);
  }
}
