import { Logger } from "@workspace/shared/lib/utils/logger";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { registerNode } from "../../registry.js";
import type { RunContext } from "../../../types.js";
import { SeedSchema } from "../../../config.js";

registerNode({
  ref: "Microsoft-365.ExchangeConfig.Query",
  label: "Microsoft 365 Exchange Config",
  description: "Queries Microsoft365 exchange config for the run scope.",
  category: "source",
  integration: "Microsoft-365",
  isGeneric: false,
  pins: [
    {
      key: "entities",
      kind: "output",
      dataType: "m365_exchange_config",
      cardinality: "array",
    },
  ],
  paramSchema: [],
  async execute(_input, ctx: RunContext) {
    const seed = SeedSchema.parse(ctx.seed);
    let entities;

    switch (seed.scope_type) {
      case "entity_ids": {
        const { data } = await supabaseHelper.batchSelect(
          "vendors",
          "m365_exchange_configs",
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
          "m365_exchange_configs",
          seed.link_ids,
          "link_id",
          500,
          (q) => void q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      case "all": {
        const { data } = await supabaseHelper.selectAll(
          "vendors",
          "m365_exchange_configs",
          (q) => void q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      default:
        entities = [] as never[];
    }

    const tagged = entities.map((e) => ({
      ...e,
      _entityType: "m365_exchange_config",
    }));

    Logger.info({
      module: "workflows",
      context: "Microsoft365.ExchangeConfig.Query",
      message: `fetched ${tagged.length} exchange configs`,
    });
    return { entities: tagged, _metrics: { records_fetched: tagged.length } };
  },
});
