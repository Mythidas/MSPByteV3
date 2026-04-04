import { Logger } from "@workspace/shared/lib/utils/logger";
import { registerNode } from "../../registry.js";
import { ExecutorError } from "../../../errors.js";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { getTypeMap } from "@workspace/shared/config/integrations/integrations.js";
import { isRecord } from "@workspace/shared/lib/utils/validators.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest.js";

registerNode({
  ref: "Generic.ResolveAlert",
  label: "Resolve Alert",
  description: "Resolves open alerts for each entity in the input set.",
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
  async execute(input) {
    const entities = Array.isArray(input.entities)
      ? input.entities.map((e) => (isRecord(e) ? e : {}))
      : [];
    const alertDefinitionId = String(input.alert_definition_id);
    const entityType = String(entities[0]._entityType);

    if (!entityType || !getTypeMap().has(entityType as IngestType)) {
      throw new ExecutorError(
        `Generic.ResolveAlert: unknown or missing _entityType "${entityType}"`,
      );
    }

    const entityIds = entities.map((e) => String(e.id));
    let recordsResolved = 0;

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
          `Generic.ResolveAlert: failed to fetch open alerts: ${fetchError.message}`,
        );
      }

      // 2. Resolve by alert row ID
      const resolvedIds = openAlerts.map((a) => a.id);

      if (resolvedIds.length > 0) {
        const { error: updateError } = await supabaseHelper.batchUpdate(
          "public",
          "alerts",
          resolvedIds,
          { resolved_at: new Date().toISOString() },
        );
        if (updateError)
          throw new ExecutorError(
            `Generic.ResolveAlert: update failed: ${updateError.message}`,
          );
        recordsResolved = resolvedIds.length;
      }

      Logger.info({
        module: "workflows",
        context: "Generic.ResolveAlert",
        message: `Processed ${entityIds.length} entities: ${recordsResolved} resolved, ${entityIds.length - recordsResolved} skipped`,
      });
    } catch (err) {
      throw err instanceof ExecutorError ? err : new ExecutorError(String(err));
    }

    return {
      _metrics: {
        input_count: entityIds.length,
        records_resolved: recordsResolved,
        records_skipped: entityIds.length - recordsResolved,
        records_failed: 0,
      },
    };
  },
});
