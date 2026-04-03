import { Logger } from "@workspace/shared/lib/utils/logger";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { ExecutorError } from "../../../errors.js";
import { TablesInsert } from "@workspace/shared/types/database.js";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { isRecord } from "@workspace/shared/lib/utils/validators.js";
import { getTypeMap } from "@workspace/shared/config/integrations/integrations.js";

registerNode({
  ref: "Generic.ApplyTag",
  label: "Apply Tag",
  description: "Applies a tag to each entity in the input set.",
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
  ],
  paramSchema: [
    {
      key: "tag_definition_id",
      label: "Tag Definition",
      dataType: "string",
      cardinality: "single",
      required: true,
    },
  ],
  async execute(input, ctx: RunContext) {
    const entities = Array.isArray(input.entities)
      ? input.entities.map((e) => (isRecord(e) ? e : {}))
      : [];
    const tagDefinitionId = String(input.tag_definition_id);
    const entityType = String(entities[0]._entityType);

    if (!tagDefinitionId) {
      throw new ExecutorError(`Generic.ApplyTag: missing tag_definition_id`);
    }

    if (!entityType || !(entityType in getTypeMap())) {
      throw new ExecutorError(
        `Generic.ApplyTag: unknown or missing _entityType "${entityType}"`,
      );
    }

    Logger.info({
      module: "workflows",
      context: "Generic.ApplyTag",
      message: `Would apply tag ${tagDefinitionId} to ${entities.length} entities`,
    });

    const entityIds = entities.map((e) => String(e.id));

    try {
      if (entityIds.length > 0) {
        const now = new Date().toISOString();
        const rows = entityIds.map(
          (id) =>
            ({
              entity_id: id,
              entity_type: entityType,
              created_at: now,
              tenant_id: ctx.tenant_id,
              definition_id: tagDefinitionId,
            }) satisfies TablesInsert<"public", "tags">,
        );

        const { error } = await supabaseHelper.batchUpsert(
          "public",
          "tags",
          rows,
          500,
          ["tenant_id", "definition_id", "entity_id", "entity_type"],
        );
        if (error)
          throw new ExecutorError(
            `Generic.ApplyTags: upsert failed: ${error.message}`,
          );
      }
    } catch (err) {
      throw err instanceof ExecutorError ? err : new ExecutorError(String(err));
    }

    return {
      _metrics: {
        input_count: entities.length,
      },
    };
  },
});
