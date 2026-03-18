import type { TenantId, SiteId, LinkId } from "../tenant";
import type { IngestType } from "../ingest";

export type EnrichmentType = string; // e.g. 'device_compliance_score'

export type EnrichmentDependency = {
  integrationId: string;
  ingestType: IngestType;
};

export interface EnrichmentContract {
  readonly enrichmentType: EnrichmentType;
  readonly dependencies: EnrichmentDependency[];

  // Called when all deps are confirmed fresher than last enrichment run
  run(scope: {
    tenantId: TenantId;
    siteId?: SiteId;
    linkId?: LinkId;
  }): Promise<void>;
}
