import { Logger } from "@workspace/shared/lib/utils/logger";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { ENTITY_TABLE_MAP } from "../../../lib/entity-map.js";
import { ExecutorError } from "../../../errors.js";
import { TablesInsert } from "@workspace/shared/types/database.js";
import { supabaseHelper } from "../../../lib/supabase-helper.js";

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
    const entities = input.entities as unknown[];
    const tag_definition_id = input.tag_definition_id as string;
    const entityType = (entities[0] as any)?._entityType as string | undefined;

    if (!tag_definition_id) {
      throw new ExecutorError(`Generic.ApplyTag: missing tag_definition_id`);
    }

    if (!entityType || !(entityType in ENTITY_TABLE_MAP)) {
      throw new ExecutorError(
        `Generic.ApplyTag: unknown or missing _entityType "${entityType}"`,
      );
    }

    Logger.info({
      module: "workflows",
      context: "Generic.ApplyTag",
      message: `Would apply tag ${tag_definition_id} to ${entities.length} entities`,
    });

    const entityIds = entities.map((e: any) => e.id) as string[];

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
              definition_id: tag_definition_id,
            }) as TablesInsert<"public", "tags">,
        );

        const { error } = await supabaseHelper.batchUpsert(
          "public",
          "tags",
          rows,
          500,
          ["tenant_id", "definition_id", "entity_id", "entity_type"],
        );
        if (error)
          throw new ExecutorError(`Generic.ApplyTags: upsert failed: ${error}`);
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
