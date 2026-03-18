import { CREDENTIAL_FIELDS } from "@workspace/core/config/credential-fields";
import { IntegrationId } from "@workspace/core/types/integrations";
import Encryption from "@workspace/shared/lib/utils/encryption";

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

  return { ...config, ...resolved };
}
