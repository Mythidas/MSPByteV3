import { Logger } from "@workspace/shared/lib/utils/logger";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { ExecutorError } from "../../../errors.js";
import { getSupabase } from "../../../supabase.js";
import { isRecord } from "@workspace/shared/lib/utils/validators.js";
import { getTypeMap } from "@workspace/shared/config/integrations/integrations.js";

registerNode({
  ref: "Generic.RemoveTag",
  label: "Remove Tag",
  description: "Removes a tag from each entity in the input set.",
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
      throw new ExecutorError(`Generic.RemoveTag: missing tag_definition_id`);
    }

    if (!entityType || !(entityType in getTypeMap())) {
      throw new ExecutorError(
        `Generic.RemoveTag: unknown or missing _entityType "${entityType}"`,
      );
    }

    Logger.info({
      module: "workflows",
      context: "Generic.RemoveTag",
      message: `Would remove tag ${tagDefinitionId} from ${entities.length} entities`,
    });

    const entityIds = entities.map((e) => String(e.id));

    try {
      if (entityIds.length > 0) {
        const { error } = await getSupabase()
          .schema("public")
          .from("tags")
          .delete()
          .in("entity_id", entityIds)
          .eq("definition_id", tagDefinitionId)
          .eq("entity_type", entityType)
          .eq("tenant_id", ctx.tenant_id);
        if (error)
          throw new ExecutorError(
            `Generic.RemoveTags: delete failed: ${error.message}`,
          );
      }
    } catch (err) {
      throw err instanceof ExecutorError ? err : new ExecutorError(String(err));
    }

    return {};
  },
});
