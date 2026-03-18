import { Logger } from "@workspace/shared/lib/utils/logger";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { ExecutorError } from "../../../errors.js";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { getSupabase } from "../../../supabase.js";
import { TablesInsert } from "@workspace/shared/types/database.js";
import { getTypeMap } from "@workspace/core/types/integrations.js";

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
    const entities = input.entities as Record<string, unknown>[];
    const alertDefinitionId = input.alert_definition_id as string;
    const entityType = (entities[0] as any)?._entityType as string | undefined;
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

    if (!entityType || !(entityType in getTypeMap())) {
      throw new ExecutorError(
        `Generic.CreateAlert: unknown or missing _entityType "${entityType}"`,
      );
    }

    const entityIds = entities.map((e) => e.id as string);
    const entityMap = new Map(entities.map((e) => [e.id as string, e]));
    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsFailed = 0;

    try {
      // 1. Fetch open alerts for these entities
      const { data: openAlerts, error: fetchError } =
        await supabaseHelper.batchSelect(
          "public",
          "alerts" as any,
          entityIds,
          "entity_id" as never,
          500,
          (q: any) =>
            q
              .eq("definition_id", alertDefinitionId)
              .eq("entity_type", entityType)
              .is("resolved_at", null),
        );

      if (fetchError || !openAlerts) {
        throw new ExecutorError(
          `Generic.CreateAlert: failed to fetch open alerts: ${fetchError}`,
        );
      }

      // 2. Split: entities with no open alert → insert; with open alert → update last_seen_at
      const alreadyOpenIds = new Set(
        openAlerts.map((a: any) => a.entity_id as string),
      );
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
              ent,
            ),
            status: "active",
            entity_id: id,
            entity_type: entityType,
            last_seen_at: now,
            metadata: ent,
            site_id: ent?.site_id ?? null,
            link_id: ent?.link_id ?? null,
          } as TablesInsert<"public", "alerts">;
        });

        const { error: insertError } = await supabaseHelper.batchInsert(
          "public",
          "alerts" as any,
          rows as any,
        );
        if (insertError)
          throw new ExecutorError(
            `Generic.CreateAlert: insert failed: ${insertError}`,
          );
        recordsInserted = toInsert.length;
      }

      // 4. Batch update last_seen_at on existing open alerts
      if (toUpdate.length > 0) {
        const { error: updateError } = await supabaseHelper.batchUpdateWhere(
          "public",
          "alerts" as any,
          toUpdate,
          "entity_id" as never,
          { last_seen_at: new Date().toISOString() } as any,
          500,
          (q: any) =>
            q
              .eq("definition_id", alertDefinitionId)
              .eq("entity_type", entityType)
              .is("resolved_at", null),
        );
        if (updateError)
          throw new ExecutorError(
            `Generic.CreateAlert: update failed: ${updateError}`,
          );
        recordsUpdated = toUpdate.length;
      }

      Logger.info({
        module: "workflows",
        context: "Generic.CreateAlert",
        message: `Processed ${entityIds.length} entities: ${recordsInserted} inserted, ${recordsUpdated} updated`,
      });
    } catch (err) {
      recordsFailed = entityIds.length;
      throw err instanceof ExecutorError ? err : new ExecutorError(String(err));
    }

    return {
      _metrics: {
        input_count: entities.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
      },
    };
  },
});

const hydrateMessageTemplate = (template: string, entity: any): string => {
  if (template.length === 0 || typeof entity !== "object") return "";

  let idx = 0;
  let finalValue = template;
  while (true) {
    const nextStart = template.indexOf("{{", idx);
    const nextEnd = template.indexOf("}}", nextStart);
    if (nextStart === -1 || nextEnd === -1) break;

    const key = template.substring(nextStart + 2, nextEnd);
    finalValue = finalValue.replace(`{{${key}}}`, entity[key] ?? "Unknown");
    idx = nextEnd;
  }

  return finalValue;
};
