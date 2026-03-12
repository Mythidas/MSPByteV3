import { registry } from "../../registry.js";
import { Microsoft365Adapter } from "./Microsoft365Adapter.js";
import { M365Processor } from "./M365Processor.js";
import { Microsoft365Linker } from "./Microsoft365Linker.js";
import { Microsoft365Enricher } from "./Microsoft365Enricher.js";

const DAILY = 24 * 60 * 60 * 1000;

registry.register({
  integrationId: "microsoft-365",
  adapter: new Microsoft365Adapter(),
  processor: new M365Processor(),
  linker: new Microsoft365Linker(),
  enricher: new Microsoft365Enricher(),

  // Which sync types must be fresh before linking can fire, per op
  linkOpDeps: {
    "link-identity-groups": ["identities", "groups"],
    "link-identity-roles": ["identities", "roles"],
    "link-policies": ["identities", "groups", "roles", "policies"],
  },

  // Which deps must be fresh before each enrich op can fire
  enrichOpDeps: {
    "enrich-mfa-enforced": [
      "identities", "policies",
      "link-identity-groups", "link-identity-roles", "link-policies",
    ],
  },

  // Can be a flat number (same threshold for all) or per-type
  staleThresholdMs: DAILY,
});
