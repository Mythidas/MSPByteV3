import { Logger } from "@workspace/shared/lib/utils/logger";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { SeedSchema } from "../../../config.js";

registerNode({
  ref: "Sophos.Endpoints.Query",
  label: "Sophos Endpoints",
  description: "Queries Sophos endpoints for the run scope.",
  category: "source",
  integration: "Sophos-Partner",
  isGeneric: false,
  pins: [
    {
      key: "entities",
      kind: "output",
      dataType: "sophos_endpoint",
      cardinality: "array",
    },
  ],
  paramSchema: [],
  async execute(_input, ctx: RunContext) {
    const seed = SeedSchema.parse(ctx.seed);
    let entities = [];

    switch (seed.scope_type) {
      case "entity_ids": {
        const { data } = await supabaseHelper.batchSelect(
          "vendors",
          "sophos_endpoints",
          seed.entity_ids,
          "id",
          500,
          (q) => void q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      case "link_ids": {
        const { data } = await supabaseHelper.batchSelect(
          "vendors",
          "sophos_endpoints",
          seed.link_ids,
          "link_id",
          500,
          (q) => void q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      case "site_ids": {
        const { data } = await supabaseHelper.batchSelect(
          "vendors",
          "sophos_endpoints",
          seed.site_ids,
          "site_id",
          500,
          (q) => void q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      case "all": {
        const { data } = await supabaseHelper.selectAll(
          "vendors",
          "sophos_endpoints",
          (q) => void q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
    }

    const tagged = entities.map((e) => ({
      ...e,
      _entityType: "sophos_endpoint",
    }));

    Logger.info({
      module: "workflows",
      context: "Sophos.Endpoints.Query",
      message: `fetched ${tagged.length} endpoints`,
    });
    return { entities: tagged, _metrics: { records_fetched: tagged.length } };
  },
});
