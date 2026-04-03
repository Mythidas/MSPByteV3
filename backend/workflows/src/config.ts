import z from "zod";

export const SeedSchema = z
  .object({
    scope_type: z
      .enum(["entity_ids", "site_ids", "link_ids", "all"])
      .default("all"),
    site_ids: z.array(z.string()).default([]),
    link_ids: z.array(z.string()).default([]),
    entity_ids: z.array(z.string()).default([]),
  })
  .catch({ scope_type: "all", site_ids: [], link_ids: [], entity_ids: [] });
