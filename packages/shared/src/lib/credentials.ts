import { CREDENTIAL_FIELDS } from "@workspace/shared/config/integrations/integration-credential-fields";
import Encryption from "@workspace/shared/lib/utils/encryption";
import { IntegrationId } from "@workspace/shared/types/integrations";

export function resolveCredentials(
  integrationId: IntegrationId,
  config: Record<string, unknown>,
): Record<string, string> {
  const fields = CREDENTIAL_FIELDS[integrationId];
  const resolved: Record<string, string> = {};

  for (const field of fields) {
    if (!config[field]) throw new Error(`Missing credential field: ${field}`);
    if (typeof config[field] !== "string") continue;

    resolved[field] =
      Encryption.decrypt(config[field], process.env.ENCRYPTION_KEY!) ?? "";
  }

  for (const [key, val] of Object.entries(config)) {
    if (Object.keys(resolved).includes(key)) continue;
    resolved[key] = String(val);
  }

  return resolved;
}
