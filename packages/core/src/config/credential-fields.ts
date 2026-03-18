import { IntegrationId } from "@workspace/core/types/integrations";

// packages/core — add to integrations config
export const CREDENTIAL_FIELDS: Record<IntegrationId, string[]> = {
  "microsoft-365": [],
  dattormm: ["apiSecretKey"],
  "sophos-partner": ["clientSecret"],
  cove: ["clientSecret"],
  halopsa: ["clientSecret"],
  mspagent: [],
};
