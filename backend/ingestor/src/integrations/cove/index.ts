import { registry } from "../../registry.js";
import { CoveAdapter } from "./CoveAdapter.js";

registry.register({
  integrationId: "cove",
  adapter: new CoveAdapter(),
  linkers: [],
  enrichments: [],
});
