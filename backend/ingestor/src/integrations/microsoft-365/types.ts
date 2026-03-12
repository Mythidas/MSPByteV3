import type { MSGraphIdentity } from "@workspace/shared/types/integrations/microsoft/identity.js";
import type { MSGraphGroup } from "@workspace/shared/types/integrations/microsoft/groups.js";
import type { MSGraphRole } from "@workspace/shared/types/integrations/microsoft/roles.js";
import type { MSGraphConditionalAccessPolicy } from "@workspace/shared/types/integrations/microsoft/policies.js";
import type { MSGraphSubscribedSku } from "@workspace/shared/types/integrations/microsoft/licenses.js";

// ============================================================================
// M365 ENTITY TYPES
// ============================================================================

export type M365EntityType =
  | "identities"
  | "groups"
  | "roles"
  | "policies"
  | "licenses"
  | "exchange-config";

export const M365_TYPES: M365EntityType[] = [
  "identities",
  "groups",
  "roles",
  "policies",
  "licenses",
  "exchange-config",
];

// ============================================================================
// TYPED RAW ENTITIES (adapter output)
// ============================================================================

export type RawM365Identity = {
  externalId: string;
  linkId: string | null;
  siteId: string | null;
  data: MSGraphIdentity;
};

export type RawM365Group = {
  externalId: string;
  linkId: string | null;
  data: MSGraphGroup;
};

export type RawM365Role = {
  externalId: string;
  linkId: string | null;
  data: MSGraphRole;
};

export type RawM365Policy = {
  externalId: string;
  linkId: string | null;
  data: MSGraphConditionalAccessPolicy;
};

export type RawM365License = {
  externalId: string;
  linkId: string | null;
  data: MSGraphSubscribedSku;
};

export type RawM365ExchangeConfig = {
  externalId: string;
  linkId: string | null;
  rejectDirectSend: boolean;
};

// Discriminated union for adapter output
export type RawM365Entity =
  | ({ type: "identities" } & RawM365Identity)
  | ({ type: "groups" } & RawM365Group)
  | ({ type: "roles" } & RawM365Role)
  | ({ type: "policies" } & RawM365Policy)
  | ({ type: "licenses" } & RawM365License)
  | ({ type: "exchange-config" } & RawM365ExchangeConfig);

// ============================================================================
// PROCESSED ROW (for linker + prune)
// ============================================================================

export type M365ProcessedRow = {
  id: string;
  external_id: string;
  link_id: string | null;
};
