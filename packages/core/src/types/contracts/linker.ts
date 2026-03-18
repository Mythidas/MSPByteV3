import type { TenantId, SiteId, LinkId } from "../tenant";
import type { IngestType } from "../ingest";
import { IntegrationId } from "@workspace/core/types/integrations";

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
