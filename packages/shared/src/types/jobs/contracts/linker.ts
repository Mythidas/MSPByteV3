import { IntegrationId } from "@workspace/shared/types/integrations";
import { IngestType } from "@workspace/shared/types/jobs/ingest";
import { TenantId, SiteId, LinkId } from "@workspace/shared/types/jobs/tenant";

export type LinkerType = string; // e.g. 'm365-identity-groups'

export type LinkerDependency = {
  integrationId: IntegrationId;
  ingestType: IngestType;
};

export interface LinkerContract {
  readonly linkerType: LinkerType;
  readonly dependencies: LinkerDependency[];

  // Linkers are always link-scoped (they need a linkId)
  run(scope: {
    tenantId: TenantId;
    siteId?: SiteId;
    linkId: LinkId;
  }): Promise<void>;
}
