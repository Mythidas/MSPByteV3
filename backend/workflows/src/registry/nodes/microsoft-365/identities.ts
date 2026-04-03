import { Logger } from "@workspace/shared/lib/utils/logger";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { SeedSchema } from "../../../config.js";

registerNode({
  ref: "Microsoft365.Identities.Query",
  label: "Microsoft365 Identities",
  description: "Queries Microsoft365 identities for the run scope.",
  category: "source",
  integration: "Microsoft365",
  isGeneric: false,
  pins: [
    {
      key: "entities",
      kind: "output",
      dataType: "m365_identity",
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
          "m365_identities",
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
          "m365_identities",
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
          "m365_identities",
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
          "m365_identities",
          (q) => void q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
    }

    const tagged = entities.map((e) => ({
      ...e,
      _entityType: "m365_identity",
    }));

    Logger.info({
      module: "workflows",
      context: "Microsoft365.Identities.Query",
      message: `fetched ${tagged.length} identities`,
    });
    return { entities: tagged, _metrics: { records_fetched: tagged.length } };
  },
});
