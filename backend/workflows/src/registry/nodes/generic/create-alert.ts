import { Logger } from "@workspace/shared/lib/utils/logger";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { ExecutorError } from "../../../errors.js";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { getSupabase } from "../../../supabase.js";
import { TablesInsert } from "@workspace/shared/types/database.js";
import { getTypeMap } from "@workspace/shared/config/integrations/integrations.js";
import { isJson, isRecord } from "@workspace/shared/lib/utils/validators.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest.js";

registerNode({
  ref: "Generic.CreateAlert",
  label: "Create Alert",
  description: "Creates alerts for each entity in the input set.",
  category: "sink",
  integration: null,
  isGeneric: true,
  pins: [
    {
      key: "entities",
      kind: "input",
      dataType: "string",
      cardinality: "array",
    },
    {
      key: "affectedEntitiesPin",
      kind: "output",
      dataType: "entities",
      cardinality: "array",
    },
  ],
  paramSchema: [
    {
      key: "alert_definition_id",
      label: "Alert Definition",
      dataType: "string",
      cardinality: "single",
      required: true,
    },
  ],
  async execute(input, ctx: RunContext) {
    const entities = Array.isArray(input.entities)
      ? input.entities.map((e) => (isRecord(e) ? e : {}))
      : [];
    const alertDefinitionId = String(input.alert_definition_id);
    const entityType = String(entities[0]._entityType);
    const { data: alertDefinition } = await getSupabase()
      .schema("public")
      .from("alert_definitions")
      .select("*")
      .eq("id", alertDefinitionId)
      .single();

    if (!alertDefinition) {
      throw new ExecutorError(
        `Generic.CreateAlert: Alert Definition does not exist (${alertDefinitionId})`,
      );
    }

    if (!entityType || !getTypeMap().has(entityType as IngestType)) {
      throw new ExecutorError(
        `Generic.CreateAlert: unknown or missing _entityType "${entityType}"`,
      );
    }

    const entityIds = entities.map((e) => String(e.id));
    const entityMap = new Map(entities.map((e) => [e.id, e]));
    let recordsInserted = 0;
    let recordsUpdated = 0;

    try {
      // 1. Fetch open alerts for these entities
      const { data: openAlerts, error: fetchError } =
        await supabaseHelper.batchSelect(
          "public",
          "alerts",
          entityIds,
          "entity_id",
          500,
          (q) =>
            void q
              .eq("definition_id", alertDefinitionId)
              .eq("entity_type", entityType)
              .is("resolved_at", null),
        );

      if (fetchError || !openAlerts) {
        throw new ExecutorError(
          `Generic.CreateAlert: failed to fetch open alerts: ${fetchError.message}`,
        );
      }

      // 2. Split: entities with no open alert → insert; with open alert → update last_seen_at
      const alreadyOpenIds = new Set(openAlerts.map((a) => a.entity_id));
      const toInsert = entityIds.filter((id) => !alreadyOpenIds.has(id));
      const toUpdate = entityIds.filter((id) => alreadyOpenIds.has(id));

      // 3. Batch insert new alerts
      if (toInsert.length > 0) {
        const now = new Date().toISOString();
        const rows = toInsert.map((id) => {
          const ent = entityMap.get(id);

          return {
            definition_id: alertDefinitionId,
            tenant_id: ctx.tenant_id,
            message: hydrateMessageTemplate(
              alertDefinition.message_template,
              isRecord(ent) ? ent : {},
            ),
            status: "active",
            entity_id: id,
            entity_type: entityType,
            last_seen_at: now,
            metadata: isJson(ent) ? ent : {},
            site_id: String(ent?.site_id),
            link_id: String(ent?.link_id),
          } satisfies TablesInsert<"public", "alerts">;
        });

        const { error: insertError } = await supabaseHelper.batchInsert(
          "public",
          "alerts",
          rows,
        );
        if (insertError)
          throw new ExecutorError(
            `Generic.CreateAlert: insert failed: ${insertError.message}`,
          );
        recordsInserted = toInsert.length;
      }

      // 4. Batch update last_seen_at on existing open alerts
      if (toUpdate.length > 0) {
        const { error: updateError } = await supabaseHelper.batchUpdateWhere(
          "public",
          "alerts",
          toUpdate,
          "entity_id",
          { last_seen_at: new Date().toISOString() },
          500,
          (q) =>
            void q
              .eq("definition_id", alertDefinitionId)
              .eq("entity_type", entityType)
              .is("resolved_at", null),
        );
        if (updateError)
          throw new ExecutorError(
            `Generic.CreateAlert: update failed: ${updateError.message}`,
          );
        recordsUpdated = toUpdate.length;
      }

      Logger.info({
        module: "workflows",
        context: "Generic.CreateAlert",
        message: `Processed ${entityIds.length} entities: ${recordsInserted} inserted, ${recordsUpdated} updated`,
      });
    } catch (err) {
      throw err instanceof ExecutorError ? err : new ExecutorError(String(err));
    }

    return {
      _metrics: {
        input_count: entities.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
      },
    };
  },
});

const hydrateMessageTemplate = (
  template: string,
  entity: Record<string, unknown>,
): string => {
  if (template.length === 0 || typeof entity !== "object") return "";

  let idx = 0;
  let finalValue = template;
  while (true) {
    const nextStart = template.indexOf("{{", idx);
    const nextEnd = template.indexOf("}}", nextStart);
    if (nextStart === -1 || nextEnd === -1) break;

    const key = template.substring(nextStart + 2, nextEnd);
    finalValue = finalValue.replace(`{{${key}}}`, String(entity[key]));
    idx = nextEnd;
  }

  return finalValue;
};
