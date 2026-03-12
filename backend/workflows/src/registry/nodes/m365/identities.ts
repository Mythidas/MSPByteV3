import { Logger } from "@workspace/shared/lib/utils/logger";
import { supabaseHelper } from "../../../lib/supabase-helper.js";
import { getSupabase } from "../../../supabase.js";
import { registerNode } from "../../registry.js";
import type { RunContext, RunSeed } from "../../../types.js";

registerNode({
  ref: "M365.Identities.Query",
  label: "M365 Identities",
  description: "Queries M365 identities for the run scope.",
  category: "source",
  integration: "M365",
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
    const seed = ctx.seed as unknown as RunSeed;
    let entities: unknown[] = [];

    switch (seed.scope_type) {
      case "entity_ids": {
        const { data } = await supabaseHelper.batchSelect(
          "vendors",
          "m365_identities" as any,
          seed.entity_ids!,
          "id" as never,
          500,
          (q: any) => q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      case "link_ids": {
        const { data } = await supabaseHelper.batchSelect(
          "vendors",
          "m365_identities" as any,
          seed.link_ids!,
          "link_id" as never,
          500,
          (q: any) => q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      case "site_ids": {
        const { data } = await supabaseHelper.batchSelect(
          "vendors",
          "m365_identities" as any,
          seed.site_ids!,
          "site_id" as never,
          500,
          (q: any) => q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
      case "all": {
        const { data } = await supabaseHelper.selectAll(
          "vendors",
          "m365_identities" as any,
          (q: any) => q.eq("tenant_id", ctx.tenant_id),
        );
        entities = data ?? [];
        break;
      }
    }

    const tagged = (entities as Record<string, unknown>[]).map((e) => ({
      ...e,
      _entityType: "m365_identity",
    }));

    Logger.info({
      module: "workflows",
      context: "M365.Identities.Query",
      message: `fetched ${tagged.length} identities`,
    });
    return { entities: tagged, _metrics: { records_fetched: tagged.length } };
  },
});
