import { registry } from "../../registry.js";
import { SophosPartnerAdapter } from "./SophosPartnerAdapter.js";

registry.register({
  integrationId: "sophos-partner",
  adapter: new SophosPartnerAdapter(),
  linkers: [],
  enrichments: [],
});
