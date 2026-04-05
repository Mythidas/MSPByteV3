import type { CheckDefinition, CheckContext, CheckHit } from "../types";

// Matches the seeded alert_definitions row for this check (source='platform', tenant_id=null)
export const DEFINITION_ID = "ad100001-0000-0000-0000-000000000001";

async function fn(_ctx: CheckContext): Promise<CheckHit[]> {
  // TODO: query vendors.sophos_endpoints where tamper_protection_enabled = false
  return [];
}

export const tamperProtectionDisabled: CheckDefinition = {
  definitionId: DEFINITION_ID,
  fn,
};
