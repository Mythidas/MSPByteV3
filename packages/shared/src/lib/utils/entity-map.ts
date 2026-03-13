import { INTEGRATIONS, type IntegrationId } from "@workspace/shared/config/integrations";

export type EntityTypeInfo = {
  integration: IntegrationId;
  schema: string;
  table: string;
  ingestType: string;
};

function buildEntityTableMap(): Record<string, EntityTypeInfo> {
  const result: Record<string, EntityTypeInfo> = {};
  for (const integration of Object.values(INTEGRATIONS)) {
    for (const t of integration.supportedTypes) {
      if (t.entityKey && t.schema && t.table) {
        result[t.entityKey] = {
          integration: integration.id,
          schema: t.schema,
          table: t.table,
          ingestType: t.type,
        };
      }
    }
  }
  return result;
}

export const ENTITY_TABLE_MAP: Record<string, EntityTypeInfo> = buildEntityTableMap();
