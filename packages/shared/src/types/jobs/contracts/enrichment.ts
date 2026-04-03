import { IntegrationId } from "@workspace/shared/types/integrations";
import { IngestType } from "@workspace/shared/types/jobs/ingest";
import { TenantId, SiteId, LinkId } from "@workspace/shared/types/jobs/tenant";

export type EnrichmentType = string; // e.g. 'device_compliance_score'

export type EnrichmentDependency = {
  integrationId: IntegrationId;
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
