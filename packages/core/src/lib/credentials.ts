import { CREDENTIAL_FIELDS } from "@workspace/core/config/credential-fields";
import Encryption from "@workspace/core/lib/utils/encryption";
import { IntegrationId } from "@workspace/core/types/integrations";

export async function resolveCredentials(
  integrationId: IntegrationId,
  config: Record<string, string>,
): Promise<Record<string, string>> {
  const fields = CREDENTIAL_FIELDS[integrationId];
  const resolved: Record<string, string> = {};

  for (const field of fields) {
    if (!config[field]) throw new Error(`Missing credential field: ${field}`);
    resolved[field] =
      (await Encryption.decrypt(config[field], process.env.ENCRYPTION_KEY!)) ??
      "";
  }

  return resolved;
}
