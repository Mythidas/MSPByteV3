import { IntegrationId } from "@workspace/shared/types/integrations";

export const CREDENTIAL_FIELDS: Record<IntegrationId, string[]> = {
  "microsoft-365": [],
  dattormm: ["apiSecretKey"],
  "sophos-partner": ["clientSecret"],
  cove: ["clientSecret"],
  halopsa: ["clientSecret"],
  mspagent: [],
};
