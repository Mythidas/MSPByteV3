import type { MSGraphIdentity } from "@workspace/shared/types/integrations/microsoft/identity.js";
import type { MSGraphGroup } from "@workspace/shared/types/integrations/microsoft/groups.js";
import type { MSGraphRole } from "@workspace/shared/types/integrations/microsoft/roles.js";
import type { MSGraphConditionalAccessPolicy } from "@workspace/shared/types/integrations/microsoft/policies.js";
import type { MSGraphSubscribedSku } from "@workspace/shared/types/integrations/microsoft/licenses.js";
import { BaseRawType } from "../types";
import { EntityType } from "@workspace/shared/config/integrations";

export const M365_TYPES: Partial<EntityType>[] = [
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

export type RawM365Identity = BaseRawType<MSGraphIdentity>;
export type RawM365Group = Omit<BaseRawType<MSGraphGroup>, "siteId">;
export type RawM365Role = Omit<BaseRawType<MSGraphRole>, "siteId">;
export type RawM365Policy = Omit<
  BaseRawType<MSGraphConditionalAccessPolicy>,
  "siteId"
>;
export type RawM365License = Omit<BaseRawType<MSGraphSubscribedSku>, "siteId">;
export type RawM365ExchangeConfig = Omit<
  BaseRawType<{ rejectDirectSend: boolean }>,
  "siteId"
>;

// Discriminated union for adapter output
export type RawM365Entity =
  | ({ type: "identities" } & RawM365Identity)
  | ({ type: "groups" } & RawM365Group)
  | ({ type: "roles" } & RawM365Role)
  | ({ type: "policies" } & RawM365Policy)
  | ({ type: "licenses" } & RawM365License)
  | ({ type: "exchange-config" } & RawM365ExchangeConfig);

export type M365ProcessedRow = {
  id: string;
  external_id: string;
  link_id: string | null;
};
